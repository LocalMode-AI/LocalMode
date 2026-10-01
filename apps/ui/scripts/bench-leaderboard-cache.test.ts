/**
 * The leaderboard read path: the raw dataset index is fetched without the
 * Next.js data cache, and only the small aggregate is cached.
 *
 * Next's data cache refuses any entry over 2 MB ("items over 2MB can not be
 * cached", `incremental-cache/index.js`). The rebuilt dataset index is
 * 4,453,966 bytes (371 entries), so a raw-index fetch with
 * `next: { revalidate: 300 }` was downloaded on every revalidation, never
 * stored, and the previous 42-entry copy of the 210 KB file stayed in the
 * cache indefinitely. These tests drive the real store functions, the real
 * API route handler, and the real cache wrapper; only `fetch` (the HTTP
 * boundary to raw.githubusercontent.com) and `unstable_cache` (Next's cache
 * runtime, absent outside a Next server) are replaced.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEADERBOARD_PROTOCOL_VERSIONS } from '@localmode/bench';
import type { RunIndexEntry } from '../src/lib/bench/store';

const cacheCalls: Array<{ keyParts: string[] | undefined; options: { revalidate?: number | false; tags?: string[] } | undefined }> = [];
const cachedInvocations: unknown[][] = [];
vi.mock('next/cache', () => ({
  unstable_cache: (
    fn: (...args: unknown[]) => Promise<unknown>,
    keyParts?: string[],
    options?: { revalidate?: number | false; tags?: string[] },
  ) => {
    cacheCalls.push({ keyParts, options });
    // Pass-through: every call runs the real callback, as a cache miss does.
    return (...args: unknown[]) => {
      cachedInvocations.push(args);
      return fn(...args);
    };
  },
}));

const store = await import('../src/lib/bench/store');
const { getLeaderboardSnapshot } = await import('../src/lib/bench/leaderboard-cache');
const { GET } = await import('../src/app/api/bench/leaderboard/route');

const REPO = 'example/bench-data';
const RAW_URL = `https://raw.githubusercontent.com/${REPO}/main/index/summary.json`;
const TWO_MB = 2 * 1024 * 1024;

/** One real index entry from the public dataset (65 ok cells, protocol 5). */
const TEMPLATE = JSON.parse(
  readFileSync(new URL('./__fixtures__/bench-index-entry.json', import.meta.url), 'utf8'),
) as RunIndexEntry;

/**
 * A 371-entry index with the dataset's protocol mix (293 v5, 54 v4, 19 v2,
 * 3 v3, 2 v1) and a few flagged runs, built from the real entry shape.
 */
function syntheticIndex(count = 371): RunIndexEntry[] {
  const protocols = [
    ...Array(293).fill('localmode-bench/5'),
    ...Array(54).fill('localmode-bench/4'),
    ...Array(19).fill('localmode-bench/2'),
    ...Array(3).fill('localmode-bench/3'),
    ...Array(2).fill('localmode-bench/1'),
  ] as string[];
  const subclasses = ['macos/apple-m4-max', 'macos/apple-m1-pro', 'windows/nvidia-ada', 'linux/amd-rdna3', 'ios/apple-apple'];
  return Array.from({ length: count }, (_, i) => {
    const runId = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    const subclass = subclasses[i % subclasses.length];
    return {
      ...TEMPLATE,
      runId,
      createdAt: new Date(Date.UTC(2026, 8, 1) + i * 60_000).toISOString(),
      protocol: protocols[i % protocols.length],
      deviceClass: subclass,
      deviceSubclass: subclass,
      flagged: i % 50 === 7,
      path: `runs/2026/09/${runId}.json`,
      cells: TEMPLATE.cells.map((c) => ({ ...c, decodeCharsPerSec: (c.decodeCharsPerSec ?? 100) + i })),
    };
  });
}

/** Size Next's incremental cache measures for a data-cache entry holding `value`. */
function nextEntrySize(body: string): number {
  return JSON.stringify({ kind: 'FETCH', data: { headers: {}, body, status: 200, url: '' }, revalidate: 300 }).length;
}

let served: string[] = [];
const inits: RequestInit[] = [];

beforeEach(() => {
  served = [];
  inits.length = 0;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe(RAW_URL);
    inits.push(init ?? {});
    const body = served.length > 1 ? served.shift()! : served[0];
    return new Response(body, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.BENCH_GITHUB_REPO;
});

describe('readIndex()', () => {
  it('fetches the raw index with cache: no-store and no data-cache revalidate', async () => {
    served = [JSON.stringify(syntheticIndex(3))];
    const entries = await store.readIndex(REPO);
    expect(entries).toHaveLength(3);
    expect(inits).toHaveLength(1);
    expect(inits[0].cache).toBe('no-store');
    expect(inits[0].next).toBeUndefined();
  });

  it('throws on an unreadable index instead of reporting an empty dataset', async () => {
    vi.stubGlobal('fetch', async () => new Response('Server Error', { status: 500 }));
    await expect(store.readIndex(REPO)).rejects.toMatchObject({ code: 'github-error' });
    vi.stubGlobal('fetch', async () => new Response('{"not":"an array"}', { status: 200 }));
    await expect(store.readIndex(REPO)).rejects.toMatchObject({ code: 'index-unreadable' });
    vi.stubGlobal('fetch', async () => new Response('[{"runId":', { status: 200 }));
    await expect(store.readIndex(REPO)).rejects.toMatchObject({ code: 'index-unreadable' });
  });

  it('reads a missing index (404) as an empty dataset', async () => {
    vi.stubGlobal('fetch', async () => new Response('404: Not Found', { status: 404 }));
    await expect(store.readIndex(REPO)).resolves.toEqual([]);
  });
});

describe('computeLeaderboardSnapshot() over an index larger than 2 MB', () => {
  it('aggregates all 371 entries of a 2 MB+ index into a snapshot the data cache can store', async () => {
    const entries = syntheticIndex();
    const body = JSON.stringify(entries);
    // The raw index is beyond what Next's data cache stores, as in production.
    expect(Buffer.byteLength(body)).toBeGreaterThan(TWO_MB);
    expect(nextEntrySize(body)).toBeGreaterThan(TWO_MB);
    served = [body];

    const snapshot = await store.computeLeaderboardSnapshot(REPO);

    const expectedRuns = entries.filter(
      (e) => !e.flagged && !!e.protocol && LEADERBOARD_PROTOCOL_VERSIONS.includes(e.protocol),
    );
    expect(snapshot.entries).toBe(371);
    expect(snapshot.runs).toBe(expectedRuns.length);
    expect(snapshot.runs).toBeGreaterThan(300);
    expect(snapshot.rows).toEqual(store.aggregateIndex(entries));
    expect(snapshot.protocols).toEqual(LEADERBOARD_PROTOCOL_VERSIONS);
    // Newest 25 current runs for the submissions table, without their cells.
    const newest = [...expectedRuns].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 25);
    expect(snapshot.recentSubmissions.map((e) => e.runId)).toEqual(newest.map((e) => e.runId));
    expect(snapshot.recentSubmissions.every((e) => !('cells' in e))).toBe(true);
    // What gets cached is the snapshot, and it fits under the limit.
    expect(store.dataCacheEntrySize(snapshot)).toBe(nextEntrySize(JSON.stringify(snapshot)));
    expect(store.dataCacheEntrySize(snapshot)).toBeLessThan(TWO_MB);
  });

  it('logs, rather than staying silent, when the snapshot itself would exceed the data-cache limit', async () => {
    // Every run on its own device subclass with distinct cells: rows grow
    // with the entry count until the aggregate passes 2 MB.
    const big = syntheticIndex(371).map((e, i) => ({
      ...e,
      protocol: 'localmode-bench/5',
      flagged: false,
      deviceSubclass: `synthetic/device-${i}`,
    }));
    served = [JSON.stringify(big)];
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const snapshot = await store.computeLeaderboardSnapshot(REPO);
    expect(store.dataCacheEntrySize(snapshot)).toBeGreaterThan(TWO_MB);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toMatch(/371 index entries/);
    expect(String(error.mock.calls[0][0])).toMatch(/2 MB/);
  });
});

describe('stale-cache condition', () => {
  it('never stores the raw fetch: a later read reflects the new index at once', async () => {
    const old = syntheticIndex(42);
    const rebuilt = syntheticIndex(371);
    served = [JSON.stringify(old), JSON.stringify(rebuilt)];

    const first = await store.computeLeaderboardSnapshot(REPO);
    const second = await store.computeLeaderboardSnapshot(REPO);

    expect(first.entries).toBe(42);
    expect(second.entries).toBe(371);
    expect(inits).toHaveLength(2);
    for (const init of inits) {
      expect(init.cache).toBe('no-store');
      expect(init.next).toBeUndefined();
    }
  });

  it('caches only the aggregate, keyed by repository, with a 5-minute revalidate', async () => {
    served = [JSON.stringify(syntheticIndex(5))];
    const snapshot = await getLeaderboardSnapshot(REPO);
    expect(snapshot.entries).toBe(5);
    expect(cacheCalls).toHaveLength(1);
    expect(cacheCalls[0].options?.revalidate).toBe(300);
    expect(cacheCalls[0].keyParts).toEqual(['bench-leaderboard-snapshot', ...LEADERBOARD_PROTOCOL_VERSIONS]);
    // The repository is the cached function's argument, so it is in the key.
    expect(cachedInvocations.at(-1)).toEqual([REPO]);
    expect(store.LEADERBOARD_REVALIDATE_SEC).toBe(300);
  });

  it('does not cache an empty board when the index read fails', async () => {
    vi.stubGlobal('fetch', async () => new Response('Server Error', { status: 503 }));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    // The failure propagates out of the cached callback (so nothing is
    // stored) and the wrapper renders an empty board for this request only.
    const snapshot = await getLeaderboardSnapshot(REPO);
    expect(snapshot.entries).toBe(0);
    expect(snapshot.rows).toEqual([]);
    expect(error).toHaveBeenCalled();
  });
});

describe('GET /api/bench/leaderboard', () => {
  it('keeps the response shape: rows, runs, protocols, repo', async () => {
    process.env.BENCH_GITHUB_REPO = REPO;
    const entries = syntheticIndex();
    served = [JSON.stringify(entries)];
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=300, stale-while-revalidate=300');
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['protocols', 'repo', 'rows', 'runs']);
    expect(body.repo).toBe(REPO);
    expect(body.protocols).toEqual(LEADERBOARD_PROTOCOL_VERSIONS);
    expect(body.runs).toBe(
      entries.filter((e) => !e.flagged && !!e.protocol && LEADERBOARD_PROTOCOL_VERSIONS.includes(e.protocol)).length,
    );
    expect(body.rows).toEqual(JSON.parse(JSON.stringify(store.aggregateIndex(entries))));
    expect(inits.every((init) => init.cache === 'no-store')).toBe(true);
  });
});
