/**
 * GitHub-as-database for benchmark submissions. Verified runs commit to
 * `runs/YYYY/MM/<runId>.json` in a public dataset repository; flagged runs to
 * `quarantine/…` (public, hidden from charts). A light per-run summary is
 * appended to `index/summary.json` with optimistic-concurrency retry, and the
 * leaderboard aggregates from that index. Server-only.
 */

import type { BenchRunResult, CellSummary } from '@localmode/bench';
import { BENCH_PROTOCOL_VERSION, deviceClassOf, median } from '@localmode/bench';

/** Light per-run entry stored in index/summary.json. */
export interface RunIndexEntry {
  runId: string;
  createdAt: string;
  /** Protocol version of the archived run (absent on pre-v2 entries). */
  protocol?: string;
  suite: string;
  deviceClass: string;
  browser: string;
  browserVersion: string;
  os: string;
  gpuVendor?: string;
  flagged: boolean;
  path: string;
  cells: Array<{
    cellId: string;
    runtimeId: string;
    benchModelId: string;
    modelName: string;
    workloadId: string;
    resolvedBackend: string;
    ttftMs?: number;
    decodeCharsPerSec?: number;
    /** End-to-end chars/s; the only rate for lanes with non-incremental streams. */
    overallCharsPerSec?: number;
    /** False when TTFT/decode were withheld because the stream was a burst. */
    streamIncremental?: boolean;
    singleLatencyMs?: number;
    batchTextsPerSec?: number;
    loadMs?: number;
    loadCached?: boolean;
    qualityScore?: number;
    qualityParseRate?: number;
    highVariance: boolean;
  }>;
}

/** One leaderboard row aggregated from index entries. */
export interface IndexLeaderboardRow {
  deviceClass: string;
  runtimeId: string;
  benchModelId: string;
  modelName: string;
  workloadId: string;
  submissions: number;
  ttftMs?: number;
  decodeCharsPerSec?: number;
  overallCharsPerSec?: number;
  singleLatencyMs?: number;
  batchTextsPerSec?: number;
  loadColdMs?: number;
  loadWarmMs?: number;
  qualityScore?: number;
  qualityParseRate?: number;
  resolvedBackends: string[];
  browsers: string[];
  provisional: boolean;
}

export interface BenchStoreConfig {
  repo: string;
  token: string;
}

/** Store binding from env; null in unbound (dev) mode. */
export function benchStoreConfig(): BenchStoreConfig | null {
  const repo = process.env.BENCH_GITHUB_REPO;
  const token = process.env.BENCH_GITHUB_TOKEN;
  if (!repo || !token || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  return { repo, token };
}

const API = 'https://api.github.com';

function ghHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'localmode-bench',
  };
}

/** Dataset path for a run. */
export function runPath(run: BenchRunResult, flagged: boolean): string {
  const d = new Date(run.createdAt);
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const safeId = run.runId.replace(/[^\w-]/g, '').slice(0, 64);
  return `${flagged ? 'quarantine' : 'runs'}/${yyyy}/${mm}/${safeId}.json`;
}

/**
 * Commit a run file. Uses create-only semantics: GitHub rejects a PUT without
 * `sha` when the file exists (422) — natural duplicate protection.
 *
 * @returns The repo-relative path, or throws with the GitHub error.
 */
export async function commitRun(
  config: BenchStoreConfig,
  run: BenchRunResult,
  flagged: boolean,
): Promise<string> {
  const path = runPath(run, flagged);
  const res = await fetch(`${API}/repos/${config.repo}/contents/${path}`, {
    method: 'PUT',
    headers: { ...ghHeaders(config.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `bench: ${flagged ? 'quarantine' : 'add'} run ${run.runId}`,
      content: Buffer.from(JSON.stringify(run)).toString('base64'),
    }),
  });
  if (res.status === 422) throw new BenchStoreError('duplicate-run', `run file already exists: ${path}`);
  if (!res.ok) throw new BenchStoreError('github-error', `GitHub PUT ${path} failed: ${res.status}`);
  return path;
}

export class BenchStoreError extends Error {
  constructor(
    public readonly code: 'duplicate-run' | 'github-error' | 'index-conflict',
    message: string,
  ) {
    super(message);
    this.name = 'BenchStoreError';
  }
}

const INDEX_PATH = 'index/summary.json';

/** Build the light index entry for a validated run. */
export function toIndexEntry(
  run: BenchRunResult,
  summaries: CellSummary[],
  flagged: boolean,
  path: string,
): RunIndexEntry {
  const byId = new Map(summaries.map((s) => [s.cellId, s]));
  return {
    runId: run.runId,
    createdAt: run.createdAt,
    protocol: run.protocol,
    suite: run.suite,
    deviceClass: deviceClassOf(run),
    browser: run.environment.browser.name,
    browserVersion: run.environment.browser.version,
    os: run.environment.os.platform,
    gpuVendor: run.environment.gpu.vendor,
    flagged,
    path,
    cells: run.cells
      .filter((c) => c.status === 'ok')
      .map((cell) => {
        const s = byId.get(cell.cellId);
        return {
          cellId: cell.cellId,
          runtimeId: cell.runtimeId,
          benchModelId: cell.model.benchModelId,
          modelName: cell.model.displayName,
          workloadId: cell.workloadId,
          resolvedBackend: cell.resolvedBackend,
          ttftMs: s?.ttftMs?.median,
          decodeCharsPerSec: s?.decodeCharsPerSec?.median,
          overallCharsPerSec: s?.overallCharsPerSec?.median,
          streamIncremental: s?.streamIncremental,
          singleLatencyMs: s?.singleLatencyMs?.median,
          batchTextsPerSec: s?.batchTextsPerSec?.median,
          loadMs: s?.loadMs,
          loadCached: s?.loadCached,
          qualityScore: s?.qualityScore,
          qualityParseRate: s?.qualityParseRate,
          highVariance: s?.highVariance ?? false,
        };
      }),
  };
}

/**
 * Append an entry to index/summary.json with optimistic concurrency (sha
 * compare-and-swap, up to 4 attempts on races).
 */
export async function appendToIndex(config: BenchStoreConfig, entry: RunIndexEntry): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await fetch(`${API}/repos/${config.repo}/contents/${INDEX_PATH}`, {
      headers: ghHeaders(config.token),
      cache: 'no-store',
    });
    let sha: string | undefined;
    let entries: RunIndexEntry[] = [];
    if (current.ok) {
      const body = (await current.json()) as { sha: string; content: string };
      sha = body.sha;
      try {
        entries = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')) as RunIndexEntry[];
      } catch {
        entries = [];
      }
    } else if (current.status !== 404) {
      throw new BenchStoreError('github-error', `GitHub GET index failed: ${current.status}`);
    }
    if (entries.some((e) => e.runId === entry.runId)) return;
    entries.push(entry);

    const put = await fetch(`${API}/repos/${config.repo}/contents/${INDEX_PATH}`, {
      method: 'PUT',
      headers: { ...ghHeaders(config.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `bench: index run ${entry.runId}`,
        content: Buffer.from(JSON.stringify(entries)).toString('base64'),
        ...(sha ? { sha } : {}),
      }),
    });
    if (put.ok) return;
    if (put.status !== 409 && put.status !== 422) {
      throw new BenchStoreError('github-error', `GitHub PUT index failed: ${put.status}`);
    }
    // Race with another submission — refetch and retry.
  }
  throw new BenchStoreError('index-conflict', 'index update kept conflicting');
}

/** Read the run index (raw.githubusercontent, ISR-cacheable by the caller). */
export async function readIndex(
  repo: string,
  init?: RequestInit & { next?: { revalidate?: number } },
): Promise<RunIndexEntry[]> {
  const res = await fetch(`https://raw.githubusercontent.com/${repo}/main/${INDEX_PATH}`, init);
  if (!res.ok) return [];
  try {
    const parsed = (await res.json()) as unknown;
    return Array.isArray(parsed) ? (parsed as RunIndexEntry[]) : [];
  } catch {
    return [];
  }
}

/** Minimum submissions before a leaderboard row loses its provisional badge. */
export const INDEX_HEADLINE_MIN = 3;

/**
 * Aggregate index entries into leaderboard rows (median-of-run-medians).
 * Only runs measured under `protocol` contribute: metric definitions change
 * between protocol versions, so one row must never mix them. Entries with no
 * `protocol` field predate v2 and are excluded from the current leaderboard
 * (they stay in the dataset, published as v1).
 */
export function aggregateIndex(
  entries: readonly RunIndexEntry[],
  protocol: string = BENCH_PROTOCOL_VERSION,
): IndexLeaderboardRow[] {
  interface Bucket {
    row: Pick<
      IndexLeaderboardRow,
      'deviceClass' | 'runtimeId' | 'benchModelId' | 'modelName' | 'workloadId'
    >;
    metrics: Record<string, number[]>;
    backends: Set<string>;
    browsers: Set<string>;
    runIds: Set<string>;
  }
  const buckets = new Map<string, Bucket>();
  for (const entry of entries) {
    if (entry.flagged || entry.protocol !== protocol) continue;
    for (const cell of entry.cells) {
      if (cell.workloadId === 'warm-reload') {
        // Warm-reload cells contribute the warm load metric to their model's rows.
      }
      const key = [entry.deviceClass, cell.runtimeId, cell.benchModelId, cell.workloadId].join('|');
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          row: {
            deviceClass: entry.deviceClass,
            runtimeId: cell.runtimeId,
            benchModelId: cell.benchModelId,
            modelName: cell.modelName,
            workloadId: cell.workloadId,
          },
          metrics: {},
          backends: new Set(),
          browsers: new Set(),
          runIds: new Set(),
        };
        buckets.set(key, bucket);
      }
      bucket.runIds.add(entry.runId);
      bucket.backends.add(cell.resolvedBackend);
      bucket.browsers.add(entry.browser);
      const push = (name: string, v: number | undefined) => {
        if (v === undefined) return;
        (bucket!.metrics[name] ??= []).push(v);
      };
      push('ttftMs', cell.ttftMs);
      push('decodeCharsPerSec', cell.decodeCharsPerSec);
      push('overallCharsPerSec', cell.overallCharsPerSec);
      push('singleLatencyMs', cell.singleLatencyMs);
      push('batchTextsPerSec', cell.batchTextsPerSec);
      push(cell.loadCached ? 'loadWarmMs' : 'loadColdMs', cell.loadMs);
      push('qualityScore', cell.qualityScore);
      push('qualityParseRate', cell.qualityParseRate);
    }
  }
  const rows: IndexLeaderboardRow[] = [];
  for (const bucket of buckets.values()) {
    const m = (name: string) => {
      const values = bucket.metrics[name];
      return values && values.length > 0 ? Math.round(median(values) * 100) / 100 : undefined;
    };
    rows.push({
      ...bucket.row,
      submissions: bucket.runIds.size,
      ttftMs: m('ttftMs'),
      decodeCharsPerSec: m('decodeCharsPerSec'),
      overallCharsPerSec: m('overallCharsPerSec'),
      singleLatencyMs: m('singleLatencyMs'),
      batchTextsPerSec: m('batchTextsPerSec'),
      loadColdMs: m('loadColdMs'),
      loadWarmMs: m('loadWarmMs'),
      qualityScore: m('qualityScore'),
      qualityParseRate: m('qualityParseRate'),
      resolvedBackends: [...bucket.backends].sort(),
      browsers: [...bucket.browsers].sort(),
      provisional: bucket.runIds.size < INDEX_HEADLINE_MIN,
    });
  }
  rows.sort(
    (a, b) =>
      a.deviceClass.localeCompare(b.deviceClass) ||
      a.benchModelId.localeCompare(b.benchModelId) ||
      a.runtimeId.localeCompare(b.runtimeId) ||
      a.workloadId.localeCompare(b.workloadId),
  );
  return rows;
}

// --- Rate limiting: Upstash when bound (same envs as the install counter), ---
// --- else a best-effort in-instance window.                                 ---

const memoryHits = new Map<string, { count: number; resetAt: number }>();

/** Allow `limit` submissions per `windowSec` per key. Fails open on errors. */
export async function rateLimit(key: string, limit = 5, windowSec = 3600): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url && token) {
    try {
      const redisKey = `bench:rl:${key}`;
      const res = await fetch(`${url}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([
          ['INCR', redisKey],
          ['EXPIRE', redisKey, String(windowSec), 'NX'],
        ]),
      });
      if (res.ok) {
        const [{ result }] = (await res.json()) as Array<{ result: number }>;
        return Number(result) <= limit;
      }
    } catch {
      // Fall through to the in-memory window.
    }
  }
  const now = Date.now();
  const hit = memoryHits.get(key);
  if (!hit || hit.resetAt < now) {
    memoryHits.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return true;
  }
  hit.count++;
  return hit.count <= limit;
}
