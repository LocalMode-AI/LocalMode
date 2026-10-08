/**
 * GitHub-as-database for benchmark submissions. Verified runs commit to
 * `runs/YYYY/MM/<runId>.json` in a public dataset repository; flagged runs to
 * `quarantine/…` (public, hidden from charts). A light per-run summary is
 * appended to `index/summary.json` with optimistic-concurrency retry, and the
 * leaderboard aggregates from that index. Server-only.
 */

import type { BenchRunResult, CellSummary } from '@localmode/bench';
import { NONCE_MAX_AGE_MS } from './nonce';
import {
  LEADERBOARD_PROTOCOL_VERSIONS,
  deviceClassOf,
  deviceSubclassOf,
  gpuArchitectureOf,
  median,
  refineDeviceClass,
} from '@localmode/bench';

/** Light per-run entry stored in index/summary.json. */
export interface RunIndexEntry {
  runId: string;
  createdAt: string;
  /** Protocol version of the archived run (absent on pre-v2 entries). */
  protocol?: string;
  suite: string;
  /** Coarse class: platform + WebGPU vendor-architecture. */
  deviceClass: string;
  /**
   * Class refined by the GPU model where the browser names one (absent on
   * entries written before it existed; `indexEntrySubclass()` derives it).
   */
  deviceSubclass?: string;
  browser: string;
  browserVersion: string;
  /** Rendering engine (Blink / Gecko / WebKit). */
  engine?: string;
  os: string;
  /** OS version where the browser discloses one ('unknown-frozen' otherwise). */
  osVersion?: string;
  /** CPU architecture from UA-CH (arm / x86) where disclosed. */
  architecture?: string;
  gpuVendor?: string;
  /**
   * WebGPU architecture the class is built from: the browser's label, or the
   * architecture `gpuArchitectureOf()` reads from a listed AMD device id.
   */
  gpuArchitecture?: string;
  /** The browser's own architecture label, present only when the AMD device-id table corrected it. */
  gpuArchitectureReported?: string;
  /** GPU model parsed from the WebGL renderer string (e.g. "Apple M4"). */
  gpuModel?: string;
  /** Form factor: phone / tablet / desktop / xr / tv / unknown. */
  deviceType?: string;
  /** UA-CH device model (Android only). */
  deviceModel?: string;
  cores?: number;
  /** navigator.deviceMemory (GB, Chromium-only, capped at 8). */
  deviceMemoryGB?: number;
  /** V8 heap ceiling for the tab (Chromium-only). */
  jsHeapSizeLimitBytes?: number;
  storageQuotaBytes?: number;
  crossOriginIsolated?: boolean;
  webgpu?: boolean;
  timerResolutionUs?: number;
  /** navigator.webdriver, true under automation. */
  webdriver?: boolean;
  /** Harness version and the runtime package versions that produced the run. */
  harnessVersion?: string;
  runtimeVersions?: Record<string, string>;
  /** Prolific-study runs carry `prolific:<hash>`; lab runs carry a free-text label. */
  userReportedDevice?: string;
  /**
   * Hardware a paid-study participant reported on the page
   * (`environment.userReportedHardware`): GPU name, chassis, RAM in GB.
   * Absent when the run carries no answer (and `reportedRamGB` also for
   * "Not sure"), so entries of runs without the field stay byte-identical.
   */
  reportedGpu?: string;
  reportedChassis?: 'laptop' | 'desktop' | 'other';
  reportedRamGB?: number;
  flagged: boolean;
  path: string;
  /**
   * When a maintainer added the run from a participant's exported file
   * (`scripts/import-exported-run.ts`) because its upload never went
   * through. Absent on every run the submit route published.
   */
  importedAt?: string;
  cells: Array<{
    cellId: string;
    runtimeId: string;
    runtimeVersion?: string;
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
  /** Protocol version every contributing run was measured under; rows never mix versions. */
  protocol: string;
  /** Coarse class (platform + WebGPU vendor-architecture), for rollups. */
  deviceClass: string;
  /** Class refined by GPU model where the browser names one; else the class. */
  deviceSubclass: string;
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

/**
 * Subclass of an index entry: the stored one, or, for entries written before
 * the field existed, the same derivation from the entry's coarse class and
 * GPU model (present on entries since bench 0.3.0; older entries stay coarse).
 */
export function indexEntrySubclass(entry: Pick<RunIndexEntry, 'deviceClass' | 'deviceSubclass' | 'gpuModel'>): string {
  return entry.deviceSubclass ?? refineDeviceClass(entry.deviceClass, entry.gpuModel);
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

/**
 * GitHub REST API base. `BENCH_GITHUB_API_URL` points the store at another
 * GitHub-compatible endpoint (the bench e2e spec runs one locally to receive
 * the commits of a bound store); production leaves it unset.
 */
function githubApi(): string {
  return (process.env.BENCH_GITHUB_API_URL ?? 'https://api.github.com').replace(/\/+$/, '');
}

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

/** The bytes of a published run file: compact JSON, no trailing newline. */
export function serializeRunFile(run: BenchRunResult): string {
  return JSON.stringify(run);
}

/** The bytes of `index/summary.json`: compact JSON, no trailing newline. */
export function serializeIndexEntries(entries: readonly RunIndexEntry[]): string {
  return JSON.stringify(entries);
}

/**
 * The index after adding `entry` at the end, or null when the index already
 * lists its run. Passes the same no-shrink guard as every index write.
 */
export function appendIndexEntry(entries: readonly RunIndexEntry[], entry: RunIndexEntry): RunIndexEntry[] | null {
  if (entries.some((e) => e.runId === entry.runId)) return null;
  const next = [...entries, entry];
  assertIndexNotShrinking(entries.length, next.length);
  return next;
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
  const res = await fetch(`${githubApi()}/repos/${config.repo}/contents/${path}`, {
    method: 'PUT',
    headers: { ...ghHeaders(config.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `bench: ${flagged ? 'quarantine' : 'add'} run ${run.runId}`,
      content: Buffer.from(serializeRunFile(run)).toString('base64'),
    }),
  });
  if (res.status === 422) throw new BenchStoreError('duplicate-run', `run file already exists: ${path}`);
  if (!res.ok) throw new BenchStoreError('github-error', `GitHub PUT ${path} failed: ${res.status}`);
  return path;
}

export class BenchStoreError extends Error {
  constructor(
    public readonly code: 'duplicate-run' | 'github-error' | 'index-conflict' | 'index-unreadable' | 'index-shrink',
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
  const env = run.environment;
  return {
    runId: run.runId,
    createdAt: run.createdAt,
    protocol: run.protocol,
    suite: run.suite,
    deviceClass: deviceClassOf(run),
    deviceSubclass: deviceSubclassOf(run),
    browser: env.browser.name,
    browserVersion: env.browser.version,
    engine: env.browser.engine,
    os: env.os.platform,
    osVersion: env.os.version,
    architecture: env.os.architecture,
    gpuVendor: env.gpu.vendor,
    gpuArchitecture: gpuArchitectureOf(run).architecture,
    gpuArchitectureReported: gpuArchitectureOf(run).reported,
    gpuModel: env.gpuModel,
    deviceType: env.device?.type,
    deviceModel: env.os.model || undefined,
    cores: env.hardware.cores ?? undefined,
    deviceMemoryGB: env.hardware.deviceMemoryGB ?? undefined,
    jsHeapSizeLimitBytes: env.hardware.jsHeapSizeLimitBytes,
    storageQuotaBytes: env.storage?.quotaBytes,
    crossOriginIsolated: env.flags.crossOriginIsolated,
    webgpu: env.gpu.available,
    timerResolutionUs: env.timerResolutionUs ?? undefined,
    webdriver: env.browser.webdriver,
    harnessVersion: run.harness.version,
    runtimeVersions: run.harness.runtimeVersions,
    userReportedDevice: env.userReportedDevice,
    reportedGpu: env.userReportedHardware?.gpu,
    reportedChassis: env.userReportedHardware?.chassis,
    reportedRamGB: env.userReportedHardware?.ramGB ?? undefined,
    flagged,
    path,
    cells: run.cells
      .filter((c) => c.status === 'ok')
      .map((cell) => {
        const s = byId.get(cell.cellId);
        return {
          cellId: cell.cellId,
          runtimeId: cell.runtimeId,
          runtimeVersion: cell.runtimeVersion,
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
 * Refuse an index write that would hold fewer entries than the index it
 * replaces. The submit path only ever appends, so a shrinking write means the
 * read went wrong; only a deliberate rebuild (`rebuild: true`, set by the
 * maintainer's `rebuild-bench-index` tool through `--allow-shrink`) may shrink it.
 *
 * @param previousCount - Entries in the index that was read.
 * @param nextCount - Entries in the index about to be written.
 * @param options - `rebuild: true` allows a smaller index.
 * @throws {BenchStoreError} `index-shrink` when the write would drop entries.
 */
export function assertIndexNotShrinking(
  previousCount: number,
  nextCount: number,
  options: { rebuild?: boolean } = {},
): void {
  if (nextCount < previousCount && !options.rebuild) {
    throw new BenchStoreError(
      'index-shrink',
      `refusing to replace an index of ${previousCount} entries with one of ${nextCount}`,
    );
  }
}

/**
 * Read index/summary.json for an update: its blob sha (for the compare-and-swap
 * write) and its entries. The contents endpoint is used only for the sha and
 * size, because above 1 MiB it returns `content: ""` with `encoding: "none"`;
 * the content always comes from the Git blobs endpoint, which returns base64
 * at any size up to 100 MB. Any read that cannot be trusted throws, so the
 * caller never writes over an index it did not read in full.
 *
 * @returns `{ sha: undefined, entries: [] }` when the index does not exist yet.
 * @throws {BenchStoreError} `github-error` on a failed request, `index-unreadable`
 *   when the content is missing, truncated, or not a JSON array.
 */
export async function readIndexForUpdate(
  config: BenchStoreConfig,
): Promise<{ sha: string | undefined; entries: RunIndexEntry[] }> {
  const meta = await fetch(`${githubApi()}/repos/${config.repo}/contents/${INDEX_PATH}`, {
    headers: ghHeaders(config.token),
    cache: 'no-store',
  });
  if (meta.status === 404) return { sha: undefined, entries: [] };
  if (!meta.ok) throw new BenchStoreError('github-error', `GitHub GET index failed: ${meta.status}`);
  const info = (await meta.json()) as { type?: string; sha?: string; size?: number };
  if (info.type !== 'file' || typeof info.sha !== 'string' || typeof info.size !== 'number') {
    throw new BenchStoreError('index-unreadable', 'GitHub contents response for the index has no file sha or size');
  }

  const blob = await fetch(`${githubApi()}/repos/${config.repo}/git/blobs/${info.sha}`, {
    headers: ghHeaders(config.token),
    cache: 'no-store',
  });
  if (!blob.ok) throw new BenchStoreError('github-error', `GitHub GET index blob failed: ${blob.status}`);
  const body = (await blob.json()) as { encoding?: string; content?: string };
  if (body.encoding !== 'base64' || typeof body.content !== 'string') {
    throw new BenchStoreError('index-unreadable', `index blob has encoding "${body.encoding}", expected base64`);
  }
  const bytes = Buffer.from(body.content, 'base64');
  if (bytes.length !== info.size) {
    throw new BenchStoreError(
      'index-unreadable',
      `index blob decoded to ${bytes.length} bytes, the contents API reported ${info.size}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new BenchStoreError('index-unreadable', 'index content is not valid JSON');
  }
  if (!Array.isArray(parsed)) throw new BenchStoreError('index-unreadable', 'index content is not a JSON array');
  return { sha: info.sha, entries: parsed as RunIndexEntry[] };
}

/**
 * Append an entry to index/summary.json with optimistic concurrency (sha
 * compare-and-swap, up to 4 attempts on races). An index that cannot be read
 * in full is never overwritten: the error propagates and the caller reports it.
 *
 * @throws {BenchStoreError} on an unreadable index, a failed write, or a write
 *   that would drop entries.
 */
export async function appendToIndex(config: BenchStoreConfig, entry: RunIndexEntry): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { sha, entries } = await readIndexForUpdate(config);
    const next = appendIndexEntry(entries, entry);
    if (next === null) return;

    const put = await fetch(`${githubApi()}/repos/${config.repo}/contents/${INDEX_PATH}`, {
      method: 'PUT',
      headers: { ...ghHeaders(config.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `bench: index run ${entry.runId}`,
        content: Buffer.from(serializeIndexEntries(next)).toString('base64'),
        ...(sha ? { sha } : {}),
      }),
    });
    if (put.ok) return;
    if (put.status !== 409 && put.status !== 422) {
      throw new BenchStoreError('github-error', `GitHub PUT index failed: ${put.status}`);
    }
    // Race with another submission: refetch and retry.
  }
  throw new BenchStoreError('index-conflict', 'index update kept conflicting');
}

/**
 * Read the run index from raw.githubusercontent, which serves the file at any
 * size (the contents API's 1 MiB inline limit does not apply here).
 *
 * The fetch is `cache: 'no-store'`: Next's data cache refuses entries over
 * 2 MB, and an index above that size was downloaded on every revalidation,
 * never stored, and the last copy that did fit kept being served. Callers
 * cache the small aggregate instead (`computeLeaderboardSnapshot()` behind
 * `getLeaderboardSnapshot()`). A 4.45 MB index parses in about 9 MB of heap,
 * so a plain `res.json()` is adequate.
 *
 * @returns The index entries; `[]` when the index does not exist yet (404).
 * @throws {BenchStoreError} `github-error` on any other failed request,
 *   `index-unreadable` when the body is not a complete JSON array, so a
 *   transient failure is never cached as an empty leaderboard.
 */
export async function readIndex(repo: string): Promise<RunIndexEntry[]> {
  const res = await fetch(`https://raw.githubusercontent.com/${repo}/main/${INDEX_PATH}`, { cache: 'no-store' });
  if (res.status === 404) return [];
  if (!res.ok) throw new BenchStoreError('github-error', `GET raw index failed: ${res.status}`);
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    throw new BenchStoreError('index-unreadable', 'raw index is not valid JSON');
  }
  if (!Array.isArray(parsed)) throw new BenchStoreError('index-unreadable', 'raw index is not a JSON array');
  return parsed as RunIndexEntry[];
}

/** Seconds the cached leaderboard aggregate stays fresh (the page's ISR period too). */
export const LEADERBOARD_REVALIDATE_SEC = 300;

/** Rows in the /bench "Recent submissions" table. */
export const RECENT_SUBMISSIONS_LIMIT = 25;

/**
 * Next's data cache refuses any entry larger than this (`incremental-cache`
 * logs "items over 2MB can not be cached" and keeps the previous entry).
 */
export const NEXT_DATA_CACHE_ENTRY_LIMIT = 2 * 1024 * 1024;

/** An index entry without its per-cell metrics, for the submissions table. */
export type RunIndexSubmission = Omit<RunIndexEntry, 'cells'>;

/** What the leaderboard API and the /bench page render, cached as one value. */
export interface LeaderboardSnapshot {
  /** Aggregated rows (`aggregateIndex()`). */
  rows: IndexLeaderboardRow[];
  /** Unflagged runs under a protocol the leaderboard shows. */
  runs: number;
  /** Protocol versions the rows cover. */
  protocols: string[];
  /** Newest current runs (at most `RECENT_SUBMISSIONS_LIMIT`), without cells. */
  recentSubmissions: RunIndexSubmission[];
  /** Entries in the index that was read, all protocols and flags included. */
  entries: number;
  /** When the index was read (ISO 8601). */
  generatedAt: string;
}

/**
 * Size Next's incremental cache measures for an `unstable_cache` entry holding
 * `value`: the JSON of the stored record, whose body is the JSON of the value.
 */
export function dataCacheEntrySize(value: unknown, revalidate = LEADERBOARD_REVALIDATE_SEC): number {
  return JSON.stringify({
    kind: 'FETCH',
    data: { headers: {}, body: JSON.stringify(value), status: 200, url: '' },
    revalidate,
  }).length;
}

/**
 * Build the leaderboard snapshot from index entries (pure).
 *
 * @param entries - The whole index.
 * @param protocols - Protocol versions the leaderboard shows.
 */
export function buildLeaderboardSnapshot(
  entries: readonly RunIndexEntry[],
  protocols: readonly string[] = LEADERBOARD_PROTOCOL_VERSIONS,
): LeaderboardSnapshot {
  // Same rule as the rows: unflagged runs measured under a protocol the leaderboard shows.
  const current = entries.filter((e) => !e.flagged && !!e.protocol && protocols.includes(e.protocol));
  const recentSubmissions = [...current]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, RECENT_SUBMISSIONS_LIMIT)
    .map(({ cells: _cells, ...rest }) => rest);
  return {
    rows: aggregateIndex(entries, protocols),
    runs: current.length,
    protocols: [...protocols],
    recentSubmissions,
    entries: entries.length,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Read the index (uncached) and build the snapshot. The snapshot is what gets
 * cached; if it ever grows past Next's 2 MB entry limit, Next would refuse to
 * store it and keep serving the previous one, so that condition is logged as
 * an error here instead of going unnoticed.
 *
 * @throws {BenchStoreError} when the index cannot be read (see `readIndex()`).
 */
export async function computeLeaderboardSnapshot(repo: string): Promise<LeaderboardSnapshot> {
  const entries = await readIndex(repo);
  const snapshot = buildLeaderboardSnapshot(entries);
  const size = dataCacheEntrySize(snapshot);
  if (size > NEXT_DATA_CACHE_ENTRY_LIMIT) {
    console.error(
      `[bench] the leaderboard aggregate for ${entries.length} index entries is ${size} bytes as a data-cache entry, ` +
        `over Next's 2 MB limit: it will not be cached, and an older cached aggregate may be served until it fits again`,
    );
  }
  return snapshot;
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
  protocols: readonly string[] = LEADERBOARD_PROTOCOL_VERSIONS,
): IndexLeaderboardRow[] {
  interface Bucket {
    row: Pick<
      IndexLeaderboardRow,
      'protocol' | 'deviceClass' | 'deviceSubclass' | 'runtimeId' | 'benchModelId' | 'modelName' | 'workloadId'
    >;
    metrics: Record<string, number[]>;
    backends: Set<string>;
    browsers: Set<string>;
    runIds: Set<string>;
  }
  const buckets = new Map<string, Bucket>();
  for (const entry of entries) {
    if (entry.flagged || !entry.protocol || !protocols.includes(entry.protocol)) continue;
    const protocol = entry.protocol;
    const deviceSubclass = indexEntrySubclass(entry);
    for (const cell of entry.cells) {
      if (cell.workloadId === 'warm-reload') {
        // Warm-reload cells contribute the warm load metric to their model's rows.
      }
      const key = [protocol, deviceSubclass, cell.runtimeId, cell.benchModelId, cell.workloadId].join('|');
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          row: {
            protocol,
            deviceClass: entry.deviceClass,
            deviceSubclass,
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
      // Newest protocol first ("localmode-bench/5" before "/4"), then by device.
      b.protocol.localeCompare(a.protocol, undefined, { numeric: true }) ||
      a.deviceClass.localeCompare(b.deviceClass) ||
      a.deviceSubclass.localeCompare(b.deviceSubclass) ||
      a.benchModelId.localeCompare(b.benchModelId) ||
      a.runtimeId.localeCompare(b.runtimeId) ||
      a.workloadId.localeCompare(b.workloadId),
  );
  return rows;
}

// --- Rate limiting: Upstash when bound (same envs as the install counter), ---
// --- else a best-effort in-instance window.                                 ---

const memoryHits = new Map<string, { count: number; resetAt: number }>();

/**
 * Submissions allowed per client address per hour. Devices behind one NAT
 * (a household running a lab batch, a campus, an office) share an address,
 * so the window is sized for a batch of devices, not a single browser; the
 * nonce, digest, shape, and plausibility checks are what keep the dataset
 * honest, this only bounds volume.
 */
export const SUBMIT_RATE_LIMIT = 20;
export const SUBMIT_RATE_WINDOW_SEC = 3600;

/** A rate-limit verdict with the seconds until the window opens again. */
export interface RateLimitVerdict {
  allowed: boolean;
  retryAfterSec: number;
}

/**
 * Count one attempt against `key` and allow it while the window holds at most
 * `limit` attempts. Uses Upstash when bound, else a best-effort in-instance
 * window; fails open on errors. Rejected attempts count too.
 */
export async function rateLimitWithRetry(
  key: string,
  limit = SUBMIT_RATE_LIMIT,
  windowSec = SUBMIT_RATE_WINDOW_SEC,
): Promise<RateLimitVerdict> {
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
          ['TTL', redisKey],
        ]),
      });
      if (res.ok) {
        const rows = (await res.json()) as Array<{ result: number }>;
        const count = Number(rows[0]?.result);
        const ttl = Number(rows[2]?.result);
        return { allowed: count <= limit, retryAfterSec: ttl > 0 ? ttl : windowSec };
      }
    } catch {
      // Fall through to the in-memory window.
    }
  }
  const now = Date.now();
  const hit = memoryHits.get(key);
  if (!hit || hit.resetAt < now) {
    memoryHits.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return { allowed: true, retryAfterSec: windowSec };
  }
  hit.count++;
  return { allowed: hit.count <= limit, retryAfterSec: Math.max(1, Math.ceil((hit.resetAt - now) / 1000)) };
}

/** Seconds a consumed nonce stays remembered: the nonce's own validity window. */
export const NONCE_CONSUMED_TTL_SEC = NONCE_MAX_AGE_MS / 1000;

const consumedNonces = new Map<string, number>();

/**
 * Mark a nonce as used; false when it was used before. A nonce is valid for
 * `NONCE_MAX_AGE_MS`, so without this a nonce copied out
 * of a fresh submission could front any number of fabricated runs until it
 * expired. Uses Upstash when bound (all instances agree), else an in-instance
 * set. Fails open on errors.
 */
export async function consumeNonce(nonce: string, ttlSec = NONCE_CONSUMED_TTL_SEC): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url && token) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['SET', `bench:nonce:${nonce}`, '1', 'NX', 'EX', String(ttlSec)]),
      });
      if (res.ok) {
        const { result } = (await res.json()) as { result: string | null };
        return result === 'OK';
      }
    } catch {
      // Fall through to the in-instance set.
    }
  }
  const now = Date.now();
  for (const [key, expiresAt] of consumedNonces) if (expiresAt < now) consumedNonces.delete(key);
  if (consumedNonces.has(nonce)) return false;
  consumedNonces.set(nonce, now + ttlSec * 1000);
  return true;
}

/** Allow `limit` submissions per `windowSec` per key. Fails open on errors. */
export async function rateLimit(key: string, limit = SUBMIT_RATE_LIMIT, windowSec = SUBMIT_RATE_WINDOW_SEC): Promise<boolean> {
  return (await rateLimitWithRetry(key, limit, windowSec)).allowed;
}
