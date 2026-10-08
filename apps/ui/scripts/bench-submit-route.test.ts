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
let blobFails = false;
let indexPuts = 0;

function stubGitHub() {
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith('https://api.github.com/')) return realFetch(input, init);
    if (url.includes('/contents/index/summary.json')) {
      if (init?.method === 'PUT') {
        indexPuts++;
        indexBody = Buffer.from(JSON.parse(String(init.body)).content, 'base64').toString();
        return new Response('{}', { status: 200 });
      }
      // As GitHub answers: the contents endpoint carries the blob sha and
      // size (inline content is empty above 1 MiB), the blob endpoint the bytes.
      const size = Buffer.byteLength(indexBody);
      return new Response(
        JSON.stringify({
          type: 'file',
          sha: 'abc',
          size,
          content: size > 1024 * 1024 ? '' : Buffer.from(indexBody).toString('base64'),
          encoding: size > 1024 * 1024 ? 'none' : 'base64',
        }),
        { status: 200 },
      );
    }
    if (url.endsWith('/git/blobs/abc')) {
      if (blobFails) return new Response('{"message":"Server Error"}', { status: 500 });
      return new Response(
        JSON.stringify({ sha: 'abc', size: Buffer.byteLength(indexBody), encoding: 'base64', content: Buffer.from(indexBody).toString('base64') }),
        { status: 200 },
      );
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
    blobFails = false;
    indexPuts = 0;
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

  it('publishes self-reported hardware with a normalized GPU name, recomputing the digest, and indexes it', async () => {
    const run = makeRun({ nonce: issueNonce(), runId: `run-hw-${Math.random().toString(16).slice(2)}` });
    run.environment = {
      ...run.environment,
      userReportedDevice: 'prolific:0123456789ab',
      userReportedHardware: { gpu: '  NVIDIA   GeForce RTX 4060 ', chassis: 'laptop', ramGB: 16, otherAppsRunning: true },
    };
    run.digest = await computeRunDigest(run);
    const { status, body } = await post(run);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    const published = committed[0].run;
    expect(published.environment.userReportedHardware).toEqual({
      gpu: 'NVIDIA GeForce RTX 4060',
      chassis: 'laptop',
      ramGB: 16,
      otherAppsRunning: true,
    });
    expect(typeof published.scrubbedAt).toBe('string');
    expect(published.digest).not.toBe(run.digest);
    expect(await verifyRunDigest(published)).toBe(true);
    const [entry] = JSON.parse(indexBody) as Array<Record<string, unknown>>;
    expect(entry).toMatchObject({ reportedGpu: 'NVIDIA GeForce RTX 4060', reportedChassis: 'laptop', reportedRamGB: 16 });
  });

  it('publishes already-normalized hardware as sent, with the client digest intact', async () => {
    const run = makeRun({ nonce: issueNonce(), runId: `run-hw-clean-${Math.random().toString(16).slice(2)}` });
    run.environment = { ...run.environment, userReportedHardware: { gpu: 'Apple M2', chassis: 'desktop', ramGB: null } };
    run.digest = await computeRunDigest(run);
    expect((await post(run)).status).toBe(200);
    const published = committed[0].run;
    expect(published.scrubbedAt).toBeUndefined();
    expect(published.digest).toBe(run.digest);
    expect(published.environment.userReportedHardware).toEqual({ gpu: 'Apple M2', chassis: 'desktop', ramGB: null });
    const [entry] = JSON.parse(indexBody) as Array<Record<string, unknown>>;
    expect(entry.reportedGpu).toBe('Apple M2');
    expect('reportedRamGB' in entry).toBe(false);
  });

  it('rejects malformed self-reported hardware before anything is stored', async () => {
    const run = makeRun({ nonce: issueNonce(), runId: `run-hw-bad-${Math.random().toString(16).slice(2)}` });
    run.environment = {
      ...run.environment,
      userReportedHardware: { gpu: 'RTX\u202e0604', chassis: 'tower', ramGB: 0 } as never,
    };
    run.digest = await computeRunDigest(run);
    const { status, body } = await post(run);
    expect(status).toBe(400);
    expect(body.code).toBe('invalid-shape');
    expect(body.errors).toEqual([
      'environment.userReportedHardware.gpu must be a string of 1 to 64 characters after trimming, without control characters',
      'environment.userReportedHardware.chassis must be laptop|desktop|other',
      'environment.userReportedHardware.ramGB must be an integer from 1 to 1024, or null',
    ]);
    expect(committed).toHaveLength(0);
    expect(indexPuts).toBe(0);
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

  it('refuses an expired nonce saying the page retries, and takes the same run with a fresh one and the same digest', async () => {
    const run = makeRun({ nonce: issueNonce(Date.now() - 25 * 3600_000), runId: `run-late-${Math.random().toString(16).slice(2)}` });
    run.digest = await computeRunDigest(run);
    const refused = await post(run);
    expect(refused.status).toBe(403);
    expect(refused.body).toEqual({
      ok: false,
      code: 'invalid-nonce',
      message:
        'The session token of this upload is missing or has expired. The bench page fetches a new token and tries the upload again by itself; if it still fails, export the run as JSON.',
    });
    expect(committed).toHaveLength(0);
    // What the page does before every upload attempt: swap in a fresh nonce, keep the digest.
    const accepted = await post({ ...run, nonce: issueNonce() });
    expect(accepted.status).toBe(200);
    expect(committed).toHaveLength(1);
    expect(committed[0].run.digest).toBe(run.digest);
    expect(await verifyRunDigest(committed[0].run)).toBe(true);
  });

  it('rejects a wrong digest before anything is stored', async () => {
    const run = makeRun({ nonce: issueNonce(), runId: `run-bad-${Math.random().toString(16).slice(2)}` });
    run.digest = 'not-the-digest';
    const { status, body } = await post(run);
    expect(status).toBe(400);
    expect(body.code).toBe('digest-mismatch');
    expect(committed).toHaveLength(0);
  });

  it('indexes a run when the index is over 1 MiB, keeping every existing entry', async () => {
    const existing = Array.from({ length: 2000 }, (_, i) => ({ runId: `old-${i}`, padding: 'x'.repeat(600) }));
    indexBody = JSON.stringify(existing);
    expect(Buffer.byteLength(indexBody)).toBeGreaterThan(1024 * 1024);
    const run = makeRun({ nonce: issueNonce(), runId: `run-big-${Math.random().toString(16).slice(2)}` });
    run.digest = await computeRunDigest(run);
    const { status, body } = await post(run);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    const index = JSON.parse(indexBody) as Array<{ runId: string }>;
    expect(index).toHaveLength(2001);
    expect(index[0].runId).toBe('old-0');
    expect(index.at(-1)!.runId).toBe(run.runId);
  });

  it('reports a run whose index append failed, and leaves the index untouched', async () => {
    indexBody = JSON.stringify([{ runId: 'kept' }]);
    blobFails = true;
    const run = makeRun({ nonce: issueNonce(), runId: `run-noindex-${Math.random().toString(16).slice(2)}` });
    run.digest = await computeRunDigest(run);
    const { status, body } = await post(run);
    expect(status).toBe(502);
    expect(body.code).toBe('index-update-failed');
    expect(body.ok).toBe(false);
    // The run file itself is committed and the response says where.
    expect(committed).toHaveLength(1);
    expect(body.path).toBe(committed[0].path);
    expect(String(body.url)).toContain(committed[0].path);
    expect(String(body.message)).toContain('no need to submit it again');
    expect(indexPuts).toBe(0);
    expect(JSON.parse(indexBody)).toEqual([{ runId: 'kept' }]);
  });
});
