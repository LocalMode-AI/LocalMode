/**
 * Aggregation for the public leaderboard and for offline analysis. Runs group
 * into device-class rows; medians are taken per submission first, then across
 * submissions (median-of-medians). Nothing is ever averaged across devices.
 */

import type { BenchCellResult, BenchRunResult, CellSummary, EmbedIteration, LLMIteration } from './types.js';
import { isIncrementalStream, summarizeRun, validateSubmission, type ValidateOptions } from './validate.js';
import { median } from './stats.js';

/**
 * Coarse device class: platform + WebGPU adapter vendor-architecture
 * (`macos/apple-metal-3`, `windows/amd-rdna-2`, `linux/no-webgpu`). Every
 * browser exposes these signals, so the class is the honest unit for
 * cross-device rollups; it never changes for an archived run.
 */
export function deviceClassOf(run: BenchRunResult): string {
  const env = run.environment;
  const gpu = env.gpu.available
    ? [env.gpu.vendor ?? 'gpu', env.gpu.architecture].filter(Boolean).join('-')
    : 'no-webgpu';
  return [env.os.platform.toLowerCase().replace(/\s+/g, '-'), gpu].join('/');
}

/**
 * Device subclass: the coarse class split by the GPU model where the browser
 * names a specific part (`macos/apple-m1-pro`, `android/adreno-650`). The
 * WebGPU architecture alone puts every Apple Silicon generation in one class;
 * Chromium's WebGL renderer string separates them. Where the model names
 * nothing more specific than the class (WebKit's `Apple GPU`, Windows'
 * generation-less `AMD Radeon(TM) Graphics`, Firefox's masked `..., or
 * similar` buckets) or the device has no WebGPU, the subclass is the class.
 *
 * @example
 * refineDeviceClass('macos/apple-metal-3', 'Apple M1 Pro'); // 'macos/apple-m1-pro'
 * refineDeviceClass('ios/apple-apple', 'Apple GPU'); // 'ios/apple-apple'
 */
export function refineDeviceClass(deviceClass: string, gpuModel: string | null | undefined): string {
  const model = gpuModel?.trim();
  if (!model || deviceClass.endsWith('/no-webgpu')) return deviceClass;
  if (/or similar/i.test(model)) return deviceClass;
  // A part number is the one signal that the string names a specific GPU.
  if (!/\d/.test(model)) return deviceClass;
  const slug = model
    .toLowerCase()
    .replace(/\((tm|r|c)\)/g, '')
    .replace(/^mesa\s+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) return deviceClass;
  const platform = deviceClass.split('/')[0];
  return `${platform}/${slug}`;
}

/** Device subclass of a run: its coarse class refined by the captured GPU model. */
export function deviceSubclassOf(run: BenchRunResult): string {
  return refineDeviceClass(deviceClassOf(run), run.environment.gpuModel);
}

/** One leaderboard row: a (protocol, deviceSubclass, runtime, model, workload) group. */
export interface LeaderboardRow {
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
    const protocol = run.protocol;
    const deviceClass = deviceClassOf(run);
    const deviceSubclass = refineDeviceClass(deviceClass, run.environment.gpuModel);
    const summaries = run.clientSummaries ?? summarizeRun(run);
    const byCellId = new Map<string, CellSummary>(summaries.map((s) => [s.cellId, s]));

    for (const cell of run.cells) {
      if (cell.status !== 'ok') continue;
      const summary = byCellId.get(cell.cellId);
      if (!summary) continue;
      const key = [protocol, deviceSubclass, cell.runtimeId, cell.model.benchModelId, cell.workloadId].join('|');
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          row: {
            protocol,
            deviceClass,
            deviceSubclass,
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
    'protocol', 'deviceClass', 'deviceSubclass', 'runtimeId', 'benchModelId', 'modelName', 'workloadId', 'submissions',
    'ttftMs', 'decodeCharsPerSec', 'overallCharsPerSec', 'singleLatencyMs', 'batchTextsPerSec',
    'loadColdMs', 'loadWarmMs', 'qualityScore', 'qualityParseRate', 'resolvedBackends', 'browsers',
    'highVariance', 'provisional',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.protocol, r.deviceClass, r.deviceSubclass, r.runtimeId, r.benchModelId, r.modelName, r.workloadId, r.submissions,
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
 * Long-format per-iteration CSV for offline analysis (one row per timed
 * iteration, with full environment identity columns) — feed to R/pandas.
 */
export function runsToLongCSV(runs: readonly BenchRunResult[]): string {
  const header = [
    'runId', 'createdAt', 'protocol', 'suite', 'deviceClass', 'deviceSubclass', 'browser', 'browserVersion', 'os', 'gpuVendor',
    'gpuArchitecture', 'cores', 'deviceMemoryGB', 'crossOriginIsolated', 'fingerprintMflops',
    'runtimeId', 'runtimeVersion', 'benchModelId', 'providerModelId', 'quantization', 'sizeBytes',
    'workloadId', 'resolvedBackend', 'iteration', 'ttftMs', 'decodeCharsPerSec', 'generatedChars',
    'overallCharsPerSec', 'streamIncremental', 'durationMs', 'loadMs', 'loadCached', 'status',
    // Additive columns: appended so the legacy columns keep their positions.
    'cellId', 'chunkCount', 'generatedTokensApprox', 'generatedTokensFidelity', 'tokensPerSecApprox',
    'finishReason', 'gates', 'embedCount',
  ];
  const lines = [header.join(',')];
  for (const run of runs) {
    const env = run.environment;
    const base = [
      run.runId, run.createdAt, run.protocol, run.suite, deviceClassOf(run), deviceSubclassOf(run), env.browser.name,
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
        lines.push(
          [...base, ...cellBase, '', '', '', '', '', '', '', loadMs, loadCached, cell.status,
            cell.cellId, '', '', '', '', '', '', '']
            .map(csvField)
            .join(','),
        );
        continue;
      }
      // Decode validity is a cell-level verdict, exactly as summarizeCell
      // (and therefore the leaderboard) decides it: every iteration must pass
      // the stream-coherence gate before any decode rate is derived.
      const cellIncremental =
        'chunks' in cell.iterations[0] && (cell.iterations as LLMIteration[]).every(isIncrementalStream);
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
            round2(it.endT - it.startT), loadMs, loadCached, cell.status,
            cell.cellId, ...iterationExtras(it, cellIncremental)]
            .map(csvField)
            .join(','),
        );
      });
    }
  }
  return lines.join('\n') + '\n';
}

/**
 * The additive iterations.csv fields of one iteration: chunk count, provider
 * token count and its fidelity, decode tokens/s, finish reason, validity
 * gates, and the embedding batch size.
 *
 * `tokensPerSecApprox` treats one stream chunk as one token: it is the
 * chunk count after the first visible chunk over the decode window (first
 * visible chunk to last chunk), the per-iteration value whose median
 * `summarizeCell` reports as `decodeChunksPerSec`. It is empty unless the
 * whole cell passes the stream-coherence gate (`cellIncremental`), so no
 * rate is ever derived from an incoherent trace.
 */
function iterationExtras(it: LLMIteration | EmbedIteration, cellIncremental: boolean): unknown[] {
  if (!('chunks' in it)) return ['', '', '', '', '', it.gates.join('|'), it.count];
  let tokensPerSec: unknown = '';
  const first = it.chunks.find((c) => c.c > 0);
  if (cellIncremental && first) {
    const totalChars = it.chunks.reduce((a, c) => a + c.c, 0);
    const decodeMs = it.chunks[it.chunks.length - 1].t - first.t;
    if (decodeMs > 0 && totalChars - first.c > 0) {
      tokensPerSec = round2(((it.chunks.length - 1) / decodeMs) * 1000);
    }
  }
  return [
    it.chunks.length,
    it.providerUsage?.outputTokens ?? '',
    it.providerUsage?.fidelity ?? '',
    tokensPerSec,
    it.finishReason ?? '',
    it.gates.join('|'),
    '',
  ];
}

/** `runtimeConfig` keys exported as cells.csv columns, in column order. */
const RUNTIME_CONFIG_COLUMNS = [
  // llama.cpp lanes (wllama, wllama-webgpu)
  'n_threads', 'n_threads_used', 'multithread', 'n_ctx', 'n_gpu_layers', 'offloadedLayers', 'webgpu_adapter',
  'cache_prompt', 'mmproj',
  // Transformers.js lanes
  'dtype', 'device', 'worker',
] as const;

/**
 * Per-cell CSV for offline analysis: one row per cell (every status), in run
 * order then cell order, carrying the per-cell records iterations.csv does
 * not: warmup, the load record (cache probe, declared bytes, progress
 * events), the runtime configuration, the memory samples, the quality
 * score, and the error. Joins to iterations.csv on (`runId`, `cellId`) and
 * to runs.csv on `runId`. Missing fields are empty strings, never zero.
 *
 * @param runs - Validated run results.
 * @returns CSV text with a header line.
 * @example
 * writeFileSync('cells.csv', runsToCellsCSV(runs));
 */
export function runsToCellsCSV(runs: readonly BenchRunResult[]): string {
  const header = [
    'runId', 'protocol', 'cellId', 'runtimeId', 'runtimeVersion', 'benchModelId', 'workloadId', 'workloadKind',
    'resolvedBackend', 'status', 'invalidReasons', 'iterationCount', 'discardedIterationCount', 'attemptCount',
    'warmupMs', 'loadMs', 'loadCached', 'loadDeclaredBytes', 'loadProgressEvents', 'loadProgressSpanMs',
    ...RUNTIME_CONFIG_COLUMNS,
    'memoryBaseline', 'memoryPostLoad', 'memoryPostRun', 'memoryAtError', 'memoryApi',
    'qualityTaskId', 'qualityScore', 'qualityN', 'qualityParseRate', 'errorName', 'errorMessage', 'errorCause',
  ];
  const lines = [header.join(',')];
  for (const run of runs) {
    for (const cell of run.cells) {
      lines.push(cellRow(run, cell).map(csvField).join(','));
    }
  }
  return lines.join('\n') + '\n';
}

function cellRow(run: BenchRunResult, cell: BenchCellResult): unknown[] {
  const load = cell.load;
  const progress = load?.progress;
  const config = cell.runtimeConfig ?? {};
  const memory = cell.memory;
  return [
    run.runId, run.protocol, cell.cellId, cell.runtimeId, cell.runtimeVersion, cell.model.benchModelId,
    cell.workloadId, cell.workloadKind, cell.resolvedBackend, cell.status, (cell.invalidReasons ?? []).join('|'),
    cell.iterations.length, cell.discardedIterations?.length ?? 0, cell.attempts?.length ?? 0,
    cell.warmupMs === undefined ? '' : round2(cell.warmupMs),
    load ? round2(load.endT - load.startT) : '',
    load && load.cached !== undefined ? String(load.cached) : '',
    load?.declaredBytes,
    progress?.length,
    progress && progress.length > 0 ? round2(progress[progress.length - 1].t - progress[0].t) : '',
    ...RUNTIME_CONFIG_COLUMNS.map((key) => config[key]),
    memory?.baseline, memory?.postLoad, memory?.postRun, memory?.atError, memory?.api,
    cell.quality?.taskId, cell.quality?.score, cell.quality?.n, cell.quality?.parseRate,
    cell.error?.name, cell.error?.message, cell.error?.cause,
  ];
}

/**
 * The runs.csv column name for a runtime package's version:
 * `rv_` plus the npm name with the scope `@` dropped and every other
 * non-alphanumeric run turned into `_`.
 *
 * @example
 * runtimeVersionColumn('@huggingface/transformers'); // 'rv_huggingface_transformers'
 */
export function runtimeVersionColumn(packageName: string): string {
  return (
    'rv_' +
    packageName
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
  );
}

/**
 * Per-run CSV for offline analysis: one row per run, in input order, with the
 * run's identity, harness build, suite, environment (device class, browser,
 * OS, cores, memory, screen, WebGPU adapter), cell counts by status, suite
 * duration (`suite-end` minus `suite-start`), the validation verdict and
 * flags `validateSubmission` reports, and the series membership and cold-start
 * marker from `harness` (`seriesId`, `seriesIndex`, `seriesCount`,
 * `coldStart`; empty on a run outside a series or not started cold). Runtime package versions follow as one
 * `rv_*` column per package in the union of all runs, sorted by column name.
 *
 * @param runs - Run results that passed shape validation.
 * @param validateOptions - Passed to `validateSubmission`; defaults to
 *   `{ anyProtocol: true }`, the archive analysis setting.
 * @returns CSV text with a header line.
 * @example
 * writeFileSync('runs.csv', runsToRunsCSV(runs));
 */
export function runsToRunsCSV(
  runs: readonly BenchRunResult[],
  validateOptions: ValidateOptions = { anyProtocol: true },
): string {
  const versionColumns = new Map<string, string>();
  for (const run of runs) {
    for (const pkg of Object.keys(run.harness.runtimeVersions ?? {})) {
      const column = runtimeVersionColumn(pkg);
      if (!versionColumns.has(column)) versionColumns.set(column, pkg);
    }
  }
  const rvColumns = [...versionColumns.keys()].sort();
  const header = [
    'runId', 'createdAt', 'protocol', 'schemaVersion', 'harnessName', 'harnessVersion', 'harnessAppVersion',
    'harnessCommit', 'suite', 'qualityLane', 'deviceClass', 'deviceSubclass', 'browser', 'browserVersion',
    'browserEngine', 'os', 'osVersion', 'osArchitecture', 'deviceType', 'hardwareConcurrency', 'coresClamped',
    'deviceMemoryGB', 'deviceMemoryCapped', 'screenWidth', 'screenHeight', 'screenDpr', 'gpuAvailable', 'gpuVendor',
    'gpuArchitecture', 'gpuDevice', 'gpuDescription', 'gpuIsFallbackAdapter', 'gpuModel', 'crossOriginIsolated',
    'timerResolutionUs', 'fingerprintMflops', 'cellsTotal', 'cellsOk', 'cellsInvalid', 'cellsError', 'cellsSkipped',
    'suiteDurationMs', 'scrubbedAt', 'validationOk', 'validationFlags',
    'seriesId', 'seriesIndex', 'seriesCount', 'coldStart',
    ...rvColumns,
  ];
  const lines = [header.join(',')];
  for (const run of runs) {
    const env = run.environment;
    const count = (status: BenchCellResult['status']) => run.cells.filter((c) => c.status === status).length;
    const start = run.events.find((e) => e.type === 'suite-start');
    const end = [...run.events].reverse().find((e) => e.type === 'suite-end');
    const report = validateSubmission(run, validateOptions);
    const versions = run.harness.runtimeVersions ?? {};
    const byColumn = new Map(Object.entries(versions).map(([pkg, v]) => [runtimeVersionColumn(pkg), v]));
    lines.push(
      [
        run.runId, run.createdAt, run.protocol, run.schemaVersion, run.harness.name, run.harness.version,
        run.harness.appVersion, run.harness.commit, run.suite,
        run.cells.some((c) => c.workloadKind.startsWith('quality-')),
        deviceClassOf(run), deviceSubclassOf(run), env.browser.name, env.browser.version, env.browser.engine,
        env.os.platform, env.os.version, env.os.architecture, env.device?.type,
        env.hardware.cores, env.hardware.coresClamped, env.hardware.deviceMemoryGB, env.hardware.deviceMemoryCapped,
        env.screen?.width, env.screen?.height, env.screen?.dpr,
        env.gpu.available, env.gpu.vendor, env.gpu.architecture, env.gpu.device, env.gpu.description,
        env.gpu.isFallbackAdapter, env.gpuModel, env.flags.crossOriginIsolated, env.timerResolutionUs,
        run.fingerprint ? round2(run.fingerprint.mflops) : '',
        run.cells.length, count('ok'), count('invalid'), count('error'), count('skipped'),
        start && end ? round2(end.t - start.t) : '',
        run.scrubbedAt, report.ok,
        report.flags.map((f) => `${f.severity}:${f.code}`).join('|'),
        run.harness.series?.id, run.harness.series?.index, run.harness.series?.count, run.harness.coldStart,
        ...rvColumns.map((column) => byColumn.get(column)),
      ]
        .map(csvField)
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}
