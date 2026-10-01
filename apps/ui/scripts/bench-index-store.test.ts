/**
 * The leaderboard index read-modify-write (`appendToIndex`) over the GitHub
 * REST boundary. Only `fetch` is replaced, by a fake GitHub that answers the
 * way the real API does for `index/summary.json`:
 *
 * - `GET /repos/{o}/{r}/contents/{path}` returns `content` (base64) and
 *   `encoding: "base64"` for a file up to 1 MiB; above that it returns the
 *   same object with `content: ""` and `encoding: "none"` (observed on the
 *   dataset at commit b6c49a2, a 1,055,628-byte index: HTTP 200, size
 *   1055628, content "", encoding "none"; GitHub's docs: "Between 1-100 MB:
 *   Only the raw or object custom media types are supported").
 * - `GET /repos/{o}/{r}/git/blobs/{sha}` returns the base64 content at any
 *   size up to 100 MB.
 * - `PUT /contents/{path}` with a stale `sha` answers 409.
 *
 * Every store function runs unmodified; the assertions read the file the
 * fake repository holds afterwards.
 */
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunIndexEntry } from '../src/lib/bench/store';
import * as store from '../src/lib/bench/store';

const REPO = 'example/bench-data';
const CONFIG = { repo: REPO, token: 'test-token' };
const INDEX = 'index/summary.json';
const ONE_MIB = 1024 * 1024;

interface FakeFile {
  bytes: Buffer;
  sha: string;
}

const files = new Map<string, FakeFile>();
const calls: Array<{ method: string; url: string }> = [];
/** Per-test override for the blob endpoint (to simulate a failing read). */
let blobOverride: ((sha: string) => Response) | null = null;
/** Number of PUTs to the index that should lose a sha race before succeeding. */
let racesToLose = 0;

function gitSha(bytes: Buffer): string {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

function putFile(path: string, text: string): void {
  const bytes = Buffer.from(text, 'utf8');
  files.set(path, { bytes, sha: gitSha(bytes) });
}

function fakeGitHub() {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ method, url });
    const prefix = `https://api.github.com/repos/${REPO}/`;
    if (!url.startsWith(prefix)) return new Response('unexpected host', { status: 599 });
    const rest = url.slice(prefix.length).split('?')[0];

    if (rest.startsWith('git/blobs/') && method === 'GET') {
      const sha = rest.slice('git/blobs/'.length);
      if (blobOverride) return blobOverride(sha);
      const file = [...files.values()].find((f) => f.sha === sha);
      if (!file) return Response.json({ message: 'Not Found' }, { status: 404 });
      return Response.json({ sha, size: file.bytes.length, encoding: 'base64', content: file.bytes.toString('base64') });
    }

    if (rest.startsWith('contents/')) {
      const path = rest.slice('contents/'.length);
      const file = files.get(path);
      if (method === 'GET') {
        if (!file) return Response.json({ message: 'Not Found' }, { status: 404 });
        const large = file.bytes.length > ONE_MIB;
        return Response.json({
          name: path.split('/').pop(),
          path,
          sha: file.sha,
          size: file.bytes.length,
          type: 'file',
          content: large ? '' : file.bytes.toString('base64'),
          encoding: large ? 'none' : 'base64',
        });
      }
      if (method === 'PUT') {
        const body = JSON.parse(String(init?.body)) as { content: string; sha?: string };
        if (file && !body.sha) return Response.json({ message: '"sha" wasn\'t supplied.' }, { status: 422 });
        if (path === INDEX && racesToLose > 0) {
          racesToLose--;
          // Another submission landed first: the file moved on under us.
          const entries = JSON.parse(file ? file.bytes.toString('utf8') : '[]') as RunIndexEntry[];
          putFile(path, JSON.stringify([...entries, makeEntry('racer')]));
          return Response.json({ message: 'conflict' }, { status: 409 });
        }
        if (file && body.sha !== file.sha) return Response.json({ message: 'conflict' }, { status: 409 });
        putFile(path, Buffer.from(body.content, 'base64').toString('utf8'));
        return Response.json({ content: { sha: files.get(path)!.sha } }, { status: file ? 200 : 201 });
      }
    }
    return Response.json({ message: 'Not Found' }, { status: 404 });
  });
}

function makeEntry(runId: string): RunIndexEntry {
  return {
    runId,
    createdAt: '2026-09-24T06:00:00.000Z',
    protocol: 'localmode-bench/5',
    suite: 'full',
    deviceClass: 'macos/apple-metal-3',
    deviceSubclass: 'macos/apple-m4-max',
    browser: 'Chrome',
    browserVersion: '141',
    os: 'macOS',
    gpuModel: 'Apple M4 Max',
    harnessVersion: '0.9.0',
    flagged: false,
    path: `runs/2026/09/${runId}.json`,
    cells: [
      {
        cellId: 'wllama/qwen3-0.6b/chat-pp128-tg128',
        runtimeId: 'wllama',
        benchModelId: 'qwen3-0.6b',
        modelName: 'Qwen3 0.6B (GGUF Q4_K_M)',
        workloadId: 'chat-pp128-tg128',
        resolvedBackend: 'wasm',
        ttftMs: 512.5,
        decodeCharsPerSec: 91.25,
        loadMs: 12_000,
        loadCached: false,
        highVariance: false,
      },
    ],
  };
}

/** An index of at least `minBytes` bytes, as the submit path writes it (compact JSON). */
function seedIndex(minBytes: number): RunIndexEntry[] {
  const entries: RunIndexEntry[] = [];
  let text = '[]';
  while (Buffer.byteLength(text) < minBytes) {
    entries.push(makeEntry(`seed-${String(entries.length).padStart(5, '0')}`));
    text = JSON.stringify(entries);
  }
  putFile(INDEX, text);
  return entries;
}

function storedIndex(): RunIndexEntry[] {
  return JSON.parse(files.get(INDEX)!.bytes.toString('utf8')) as RunIndexEntry[];
}

function indexPuts() {
  return calls.filter((c) => c.method === 'PUT' && c.url.endsWith(`/contents/${INDEX}`));
}

describe('appendToIndex() against the GitHub contents API', () => {
  beforeEach(() => {
    files.clear();
    calls.length = 0;
    blobOverride = null;
    racesToLose = 0;
    fakeGitHub();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('the fake answers like GitHub: no inline content above 1 MiB', async () => {
    seedIndex(ONE_MIB + 1);
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${INDEX}`);
    const body = (await res.json()) as { content: string; encoding: string; size: number };
    expect(res.status).toBe(200);
    expect(body.content).toBe('');
    expect(body.encoding).toBe('none');
    expect(body.size).toBeGreaterThan(ONE_MIB);
  });

  it('keeps every existing entry when the index is just under 1 MiB', async () => {
    const seeded = seedIndex(ONE_MIB - 4096);
    expect(Buffer.byteLength(JSON.stringify(seeded))).toBeLessThanOrEqual(ONE_MIB);
    await store.appendToIndex(CONFIG, makeEntry('new-run'));
    const after = storedIndex();
    expect(after).toHaveLength(seeded.length + 1);
    expect(after.slice(0, seeded.length)).toEqual(seeded);
    expect(after.at(-1)!.runId).toBe('new-run');
  });

  it('keeps every existing entry when the index is over 1 MiB (the contents API returns content "")', async () => {
    const seeded = seedIndex(ONE_MIB + 8192);
    expect(Buffer.byteLength(JSON.stringify(seeded))).toBeGreaterThan(ONE_MIB);
    await store.appendToIndex(CONFIG, makeEntry('new-run'));
    const after = storedIndex();
    expect(after).toHaveLength(seeded.length + 1);
    expect(after.slice(0, seeded.length)).toEqual(seeded);
    expect(after.at(-1)!.runId).toBe('new-run');
    expect(indexPuts()).toHaveLength(1);
  });

  it('never overwrites an index whose content cannot be fetched', async () => {
    const seeded = seedIndex(ONE_MIB + 8192);
    const before = files.get(INDEX)!.sha;
    blobOverride = () => Response.json({ message: 'Server Error' }, { status: 500 });
    await expect(store.appendToIndex(CONFIG, makeEntry('new-run'))).rejects.toBeInstanceOf(store.BenchStoreError);
    expect(indexPuts()).toHaveLength(0);
    expect(files.get(INDEX)!.sha).toBe(before);
    expect(storedIndex()).toHaveLength(seeded.length);
  });

  it('never overwrites an index whose content does not parse as an array', async () => {
    putFile(INDEX, '{"not":"an array"}');
    const before = files.get(INDEX)!.sha;
    await expect(store.appendToIndex(CONFIG, makeEntry('new-run'))).rejects.toMatchObject({ code: 'index-unreadable' });
    expect(indexPuts()).toHaveLength(0);
    expect(files.get(INDEX)!.sha).toBe(before);
  });

  it('never overwrites an index whose blob is shorter than the size the contents API reported', async () => {
    seedIndex(ONE_MIB + 8192);
    const before = files.get(INDEX)!.sha;
    blobOverride = (sha) => Response.json({ sha, size: 2, encoding: 'base64', content: Buffer.from('[]').toString('base64') });
    await expect(store.appendToIndex(CONFIG, makeEntry('new-run'))).rejects.toMatchObject({ code: 'index-unreadable' });
    expect(indexPuts()).toHaveLength(0);
    expect(files.get(INDEX)!.sha).toBe(before);
  });

  it('creates the index when the file does not exist yet', async () => {
    await store.appendToIndex(CONFIG, makeEntry('first'));
    expect(storedIndex().map((e) => e.runId)).toEqual(['first']);
  });

  it('re-reads after losing a sha race and keeps both submissions', async () => {
    const seeded = seedIndex(ONE_MIB + 8192);
    racesToLose = 1;
    await store.appendToIndex(CONFIG, makeEntry('new-run'));
    const ids = storedIndex().map((e) => e.runId);
    expect(ids).toHaveLength(seeded.length + 2);
    expect(ids.slice(-2)).toEqual(['racer', 'new-run']);
  });

  it('does not append a run that is already indexed', async () => {
    const seeded = seedIndex(ONE_MIB + 8192);
    await store.appendToIndex(CONFIG, seeded[3]);
    expect(indexPuts()).toHaveLength(0);
    expect(storedIndex()).toHaveLength(seeded.length);
  });
});

describe('assertIndexNotShrinking()', () => {
  it('refuses to write fewer entries than were read, unless the write is a documented rebuild', () => {
    expect(typeof store.assertIndexNotShrinking).toBe('function');
    expect(() => store.assertIndexNotShrinking(42, 1)).toThrow(store.BenchStoreError);
    expect(() => store.assertIndexNotShrinking(42, 1)).toThrow(/42.*1/);
    expect(() => store.assertIndexNotShrinking(42, 42)).not.toThrow();
    expect(() => store.assertIndexNotShrinking(42, 43)).not.toThrow();
    expect(() => store.assertIndexNotShrinking(42, 1, { rebuild: true })).not.toThrow();
  });
});
