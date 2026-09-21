/**
 * The submit route end to end through the real handler: nonce verification,
 * digest verification, shape validation, the publication scrub, and the
 * single-use nonce. Only the GitHub boundary is stubbed (the documented mock
 * layer for this store); everything the route does to the payload runs
 * unmodified, and the assertions read the file the route would have
 * committed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { computeRunDigest, computeLegacyRunDigest, verifyRunDigest, type BenchRunResult } from '@localmode/bench';
import { makeRun } from '../../../packages/bench/tests/helpers';
import { issueNonce } from '../src/lib/bench/nonce';

const committed: Array<{ path: string; run: BenchRunResult }> = [];
let indexBody = '[]';

function stubGitHub() {
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith('https://api.github.com/')) return realFetch(input, init);
    if (url.includes('/contents/index/summary.json')) {
      if (init?.method === 'PUT') {
        indexBody = Buffer.from(JSON.parse(String(init.body)).content, 'base64').toString();
        return new Response('{}', { status: 200 });
      }
      return new Response(JSON.stringify({ sha: 'abc', content: Buffer.from(indexBody).toString('base64') }), { status: 200 });
    }
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body));
      committed.push({ path: url.split('/contents/')[1], run: JSON.parse(Buffer.from(body.content, 'base64').toString()) });
      return new Response('{}', { status: 201 });
    }
    return new Response('{}', { status: 404 });
  });
}

async function post(payload: unknown, ip = '203.0.113.7') {
  const { POST } = await import('../src/app/api/bench/submit/route');
  const req = new NextRequest('https://localmode.ai/api/bench/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(payload),
  });
  const res = await POST(req);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('POST /api/bench/submit', () => {
  beforeEach(() => {
    process.env.BENCH_GITHUB_REPO = 'example/bench-data';
    process.env.BENCH_GITHUB_TOKEN = 'test-token';
    process.env.BENCH_NONCE_SECRET = 'unit-test-secret';
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.KV_REST_API_URL;
    committed.length = 0;
    indexBody = '[]';
    stubGitHub();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('publishes a schema-3 submission as sent, minus the nonce, with the client digest intact', async () => {
    const run = makeRun({ nonce: issueNonce(), runId: `run-clean-${Math.random().toString(16).slice(2)}` });
    run.digest = await computeRunDigest(run);
    const { status, body } = await post(run);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(committed).toHaveLength(1);
    const published = committed[0].run;
    expect(published.nonce).toBeUndefined();
    expect(published.scrubbedAt).toBeUndefined();
    expect(published.digest).toBe(run.digest);
    expect(await verifyRunDigest(published)).toBe(true);
  });

  it('scrubs a submission from a page built before schema 3 and recomputes its digest', async () => {
    const run = makeRun({ nonce: issueNonce(), runId: `run-legacy-${Math.random().toString(16).slice(2)}` });
    (run as { schemaVersion: number }).schemaVersion = 2;
    const env = run.environment as unknown as Record<string, unknown>;
    env.locale = { timeZone: 'America/Chicago', timeZoneOffsetMinutes: 300, locale: 'en-US', calendar: 'gregory' };
    env.languages = ['en-US', 'en'];
    env.power = { batterySupported: true, charging: false, level: 0.34, dischargingTimeSec: 7200 };
    env.display = { width: 414, height: 896, dpr: 3, prefersColorScheme: 'dark' };
    // An old page digests under the legacy rule, nonce included.
    run.digest = await computeLegacyRunDigest(run);
    const { status, body } = await post(run);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    const published = committed[0].run;
    const penv = published.environment as unknown as Record<string, Record<string, unknown>>;
    expect(published.nonce).toBeUndefined();
    expect(published.schemaVersion).toBe(3);
    expect(typeof published.scrubbedAt).toBe('string');
    expect(penv.locale).toEqual({ locale: 'en-US' });
    expect('languages' in penv).toBe(false);
    expect(penv.power).toEqual({ batterySupported: true, charging: false, level: 0.25 });
    expect(penv.display).toEqual({ width: 414, height: 896, dpr: 3 });
    expect(published.digest).not.toBe(run.digest);
    expect(await verifyRunDigest(published)).toBe(true);
    // The index entry never carried these fields either.
    expect(indexBody).not.toContain('America/Chicago');
  });

  it('refuses a nonce the second time it is presented', async () => {
    const nonce = issueNonce();
    const first = makeRun({ nonce, runId: `run-a-${Math.random().toString(16).slice(2)}` });
    first.digest = await computeRunDigest(first);
    expect((await post(first)).status).toBe(200);
    const second = makeRun({ nonce, runId: `run-b-${Math.random().toString(16).slice(2)}` });
    second.digest = await computeRunDigest(second);
    const { status, body } = await post(second);
    expect(status).toBe(409);
    expect(body.code).toBe('nonce-used');
    expect(committed).toHaveLength(1);
  });

  it('rejects a wrong digest before anything is stored', async () => {
    const run = makeRun({ nonce: issueNonce(), runId: `run-bad-${Math.random().toString(16).slice(2)}` });
    run.digest = 'not-the-digest';
    const { status, body } = await post(run);
    expect(status).toBe(400);
    expect(body.code).toBe('digest-mismatch');
    expect(committed).toHaveLength(0);
  });
});
