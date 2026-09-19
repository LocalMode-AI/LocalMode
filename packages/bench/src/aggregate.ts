/**
 * Aggregation for the public leaderboard and for paper analysis. Runs group
 * into device-class rows; medians are taken per submission first, then across
 * submissions (median-of-medians). Nothing is ever averaged across devices.
 */

import type { BenchRunResult, CellSummary } from './types.js';
import { isIncrementalStream, summarizeRun } from './validate.js';
import { median } from './stats.js';

/** Device class derived from environment identity signals. */
export function deviceClassOf(run: BenchRunResult): string {
  const env = run.environment;
  const gpu = env.gpu.available
    ? [env.gpu.vendor ?? 'gpu', env.gpu.architecture].filter(Boolean).join('-')
    : 'no-webgpu';
  return [env.os.platform.toLowerCase().replace(/\s+/g, '-'), gpu].join('/');
}

/** One leaderboard row: a (deviceClass, runtime, model, workload) group. */
export interface LeaderboardRow {
  deviceClass: string;
  runtimeId: string;
  benchModelId: string;
  modelName: string;
  workloadId: string;
  /** Number of distinct submissions contributing. */
  submissions: number;
  /** Median-of-medians metrics (only those applicable to the workload). */
  ttftMs?: number;
  decodeCharsPerSec?: number;
  /** End-to-end chars/s (prefill + decode); the only rate for lanes whose stream is not incremental. */
  overallCharsPerSec?: number;
  singleLatencyMs?: number;
  batchTextsPerSec?: number;
  loadColdMs?: number;
  loadWarmMs?: number;
  qualityScore?: number;
  /** Median MMLU parse rate; below 1 the quality score is format-limited. */
  qualityParseRate?: number;
  resolvedBackends: string[];
  browsers: string[];
  /** True when any contributing submission had a high-variance metric. */
  highVariance: boolean;
  /** Rows below the min-N threshold are provisional. */
  provisional: boolean;
}

/** Minimum concordant submissions for a non-provisional headline row. */
export const HEADLINE_MIN_SUBMISSIONS = 3;

/**
 * Aggregate validated runs into leaderboard rows.
 *
 * @param runs - Validated (non-quarantined) run results.
 * @param minSubmissions - Min submissions before a row loses `provisional`.
 * @example
 * const rows = aggregateRuns(allRuns);
 */
export function aggregateRuns(
  runs: readonly BenchRunResult[],
  minSubmissions = HEADLINE_MIN_SUBMISSIONS,
): LeaderboardRow[] {
  interface Bucket {
    row: Omit<
      LeaderboardRow,
      | 'submissions'
      | 'ttftMs'
      | 'decodeCharsPerSec'
      | 'overallCharsPerSec'
      | 'singleLatencyMs'
      | 'batchTextsPerSec'
      | 'loadColdMs'
      | 'loadWarmMs'
      | 'qualityScore'
      | 'qualityParseRate'
      | 'provisional'
    >;
    ttft: number[];
    decode: number[];
    overall: number[];
    single: number[];
    batch: number[];
    loadCold: number[];
    loadWarm: number[];
    quality: number[];
    parseRate: number[];
    runIds: Set<string>;
  }
  const buckets = new Map<string, Bucket>();

  for (const run of runs) {
    const deviceClass = deviceClassOf(run);
    const summaries = run.clientSummaries ?? summarizeRun(run);
    const byCellId = new Map<string, CellSummary>(summaries.map((s) => [s.cellId, s]));

    for (const cell of run.cells) {
      if (cell.status !== 'ok') continue;
      const summary = byCellId.get(cell.cellId);
      if (!summary) continue;
      const key = [deviceClass, cell.runtimeId, cell.model.benchModelId, cell.workloadId].join('|');
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          row: {
            deviceClass,
            runtimeId: cell.runtimeId,
            benchModelId: cell.model.benchModelId,
            modelName: cell.model.displayName,
            workloadId: cell.workloadId,
            resolvedBackends: [],
            browsers: [],
            highVariance: false,
          },
          ttft: [],
          decode: [],
          overall: [],
          single: [],
          batch: [],
          loadCold: [],
          loadWarm: [],
          quality: [],
          parseRate: [],
          runIds: new Set(),
        };
        buckets.set(key, bucket);
      }
      bucket.runIds.add(run.runId);
      pushUnique(bucket.row.resolvedBackends, cell.resolvedBackend);
      pushUnique(bucket.row.browsers, run.environment.browser.name);
      bucket.row.highVariance ||= summary.highVariance;
      if (summary.ttftMs) bucket.ttft.push(summary.ttftMs.median);
      if (summary.decodeCharsPerSec) bucket.decode.push(summary.decodeCharsPerSec.median);
      if (summary.overallCharsPerSec) bucket.overall.push(summary.overallCharsPerSec.median);
      if (summary.singleLatencyMs) bucket.single.push(summary.singleLatencyMs.median);
      if (summary.batchTextsPerSec) bucket.batch.push(summary.batchTextsPerSec.median);
      if (summary.loadMs !== undefined) {
        (summary.loadCached ? bucket.loadWarm : bucket.loadCold).push(summary.loadMs);
      }
      if (summary.qualityScore !== undefined) bucket.quality.push(summary.qualityScore);
      if (summary.qualityParseRate !== undefined) bucket.parseRate.push(summary.qualityParseRate);
    }
  }

  const rows: LeaderboardRow[] = [];
  for (const bucket of buckets.values()) {
    rows.push({
      ...bucket.row,
      submissions: bucket.runIds.size,
      ttftMs: maybeMedian(bucket.ttft),
      decodeCharsPerSec: maybeMedian(bucket.decode),
      overallCharsPerSec: maybeMedian(bucket.overall),
      singleLatencyMs: maybeMedian(bucket.single),
      batchTextsPerSec: maybeMedian(bucket.batch),
      loadColdMs: maybeMedian(bucket.loadCold),
      loadWarmMs: maybeMedian(bucket.loadWarm),
      qualityScore: maybeMedian(bucket.quality),
      qualityParseRate: maybeMedian(bucket.parseRate),
      provisional: bucket.runIds.size < minSubmissions,
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

function pushUnique(list: string[], value: string): void {
  if (value && !list.includes(value)) list.push(value);
}

function maybeMedian(values: number[]): number | undefined {
  return values.length > 0 ? round2(median(values)) : undefined;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Escape one CSV field (RFC 4180). */
function csvField(value: unknown): string {
  const s = value === undefined || value === null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Leaderboard rows as CSV. */
export function rowsToCSV(rows: readonly LeaderboardRow[]): string {
  const header = [
    'deviceClass', 'runtimeId', 'benchModelId', 'modelName', 'workloadId', 'submissions',
    'ttftMs', 'decodeCharsPerSec', 'overallCharsPerSec', 'singleLatencyMs', 'batchTextsPerSec',
    'loadColdMs', 'loadWarmMs', 'qualityScore', 'qualityParseRate', 'resolvedBackends', 'browsers',
    'highVariance', 'provisional',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.deviceClass, r.runtimeId, r.benchModelId, r.modelName, r.workloadId, r.submissions,
        r.ttftMs, r.decodeCharsPerSec, r.overallCharsPerSec, r.singleLatencyMs, r.batchTextsPerSec,
        r.loadColdMs, r.loadWarmMs, r.qualityScore, r.qualityParseRate, r.resolvedBackends.join(';'), r.browsers.join(';'),
        r.highVariance, r.provisional,
      ]
        .map(csvField)
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}

/**
 * Long-format per-iteration CSV for paper analysis (one row per timed
 * iteration, with full environment identity columns) — feed to R/pandas.
 */
export function runsToLongCSV(runs: readonly BenchRunResult[]): string {
  const header = [
    'runId', 'createdAt', 'suite', 'deviceClass', 'browser', 'browserVersion', 'os', 'gpuVendor',
    'gpuArchitecture', 'cores', 'deviceMemoryGB', 'crossOriginIsolated', 'fingerprintMflops',
    'runtimeId', 'runtimeVersion', 'benchModelId', 'providerModelId', 'quantization', 'sizeBytes',
    'workloadId', 'resolvedBackend', 'iteration', 'ttftMs', 'decodeCharsPerSec', 'generatedChars',
    'overallCharsPerSec', 'streamIncremental', 'durationMs', 'loadMs', 'loadCached', 'status',
  ];
  const lines = [header.join(',')];
  for (const run of runs) {
    const env = run.environment;
    const base = [
      run.runId, run.createdAt, run.suite, deviceClassOf(run), env.browser.name,
      env.browser.version, env.os.platform, env.gpu.vendor ?? '', env.gpu.architecture ?? '',
      env.hardware.cores ?? '', env.hardware.deviceMemoryGB ?? '', env.flags.crossOriginIsolated,
      run.fingerprint ? round2(run.fingerprint.mflops) : '',
    ];
    for (const cell of run.cells) {
      const loadMs = cell.load ? round2(cell.load.endT - cell.load.startT) : '';
      const loadCached = cell.load ? String(cell.load.cached) : '';
      const cellBase = [
        cell.runtimeId, cell.runtimeVersion ?? '', cell.model.benchModelId,
        cell.model.providerModelId, cell.model.quantization ?? '', cell.model.sizeBytes ?? '',
        cell.workloadId, cell.resolvedBackend,
      ];
      if (cell.iterations.length === 0) {
        lines.push([...base, ...cellBase, '', '', '', '', '', '', '', loadMs, loadCached, cell.status].map(csvField).join(','));
        continue;
      }
      cell.iterations.forEach((it, i) => {
        let ttft = '';
        let decodeRate = '';
        let chars = '';
        let overall = '';
        let incremental = '';
        if ('chunks' in it) {
          const totalChars = it.chunks.reduce((a, c) => a + c.c, 0);
          chars = String(totalChars);
          const totalMs = it.endT - it.startT;
          if (totalMs > 0 && totalChars > 0) overall = String(round2((totalChars / totalMs) * 1000));
          // TTFT/decode only from genuinely incremental streams (same rule as
          // summarizeCell) — a terminal-burst trace carries no decode timing.
          const isIncremental = isIncrementalStream(it);
          incremental = String(isIncremental);
          const first = it.chunks.find((c) => c.c > 0);
          if (isIncremental && first) {
            ttft = String(round2(first.t - it.startT));
            const last = it.chunks[it.chunks.length - 1];
            const decodeChars = totalChars - first.c;
            const ms = last.t - first.t;
            if (ms > 0) decodeRate = String(round2((decodeChars / ms) * 1000));
          }
        }
        lines.push(
          [...base, ...cellBase, i + 1, ttft, decodeRate, chars, overall, incremental,
            round2(it.endT - it.startT), loadMs, loadCached, cell.status]
            .map(csvField)
            .join(','),
        );
      });
    }
  }
  return lines.join('\n') + '\n';
}
