/**
 * The suite runner: executes (runtime x model x workload) cells under the
 * versioned run policy — cache probe, load, untimed warmup, N timed runs with
 * raw per-chunk traces, validity gates, memory protocol points, cool-downs —
 * and assembles the submittable BenchRunResult.
 */

import type {
  BenchCellResult,
  BenchModelRef,
  BenchRunResult,
  BenchSuiteId,
  EmbedIteration,
  EmbedWorkloadSpec,
  EnvironmentCapture,
  HarnessInfo,
  LLMIteration,
  LLMWorkloadSpec,
  LoadRecord,
  MemorySample,
  QualityWorkloadSpec,
} from './types.js';
import { BENCH_PROTOCOL_VERSION, BENCH_SCHEMA_VERSION } from './types.js';
import type {
  EmbeddingRuntimeAdapter,
  LLMRuntimeAdapter,
  LoadedEmbedder,
  LoadedLLM,
} from './adapter.js';
import { USAGE_FIDELITY } from './adapter.js';
import { MIN_GENERATED_CHARS, orderCells, type RunPolicy } from './protocol.js';
import { hrNow, sleep, abortDomException } from './timing.js';
import { TraceRecorder } from './trace.js';
import { memoryApiAvailable, sampleMemoryBytes } from './memory.js';
import { captureEnvironment } from './env.js';
import { runFingerprint } from './fingerprint.js';
import { summarizeRun } from './validate.js';
import { runMMLUFidelity, runSTSQuality } from './quality.js';

/** One planned cell. Cells sharing (runtimeId, model) reuse the loaded model. */
export interface PlannedCell {
  model: BenchModelRef;
  workload: LLMWorkloadSpec | EmbedWorkloadSpec | QualityWorkloadSpec;
  /**
   * When set, the cell is recorded as `skipped` with this reason and never
   * touches the adapter (a lane the submitter switched off, or a build the
   * device cannot run). Keeps every cell a suite defines in the result.
   */
  skipReason?: string;
}

/** A live-activity report: something observable happened inside a cell. */
export interface RunnerActivity {
  cellId: string;
  /** `waiting-visible`: the tab is hidden and the runner is waiting for it to come back before timing. */
  phase: 'load' | 'warmup' | 'iteration' | 'quality' | 'reload' | 'waiting-visible';
  /** Current iteration or quality item (1-based) and the total, where applicable. */
  iteration?: number;
  total?: number;
  /** Characters and chunks streamed so far in the current generation. */
  chars?: number;
  chunks?: number;
  /** Load progress percentage, where the provider reports one. */
  pct?: number;
}

/** Progress callbacks for a host UI. */
export interface RunnerHooks {
  /** The environment capture, before the fingerprint and the first cell (lets a host persist partial progress). */
  onEnvironment?(environment: EnvironmentCapture): void;
  onCellStart?(cellId: string, index: number, total: number): void;
  onCellFinish?(cell: BenchCellResult): void;
  onLoadProgress?(cellId: string, pct: number | undefined): void;
  onIteration?(cellId: string, iteration: number, total: number): void;
  /**
   * Fires on every observable step inside a cell (each streamed chunk, each
   * load progress event, each quality item), so a host can show that the run
   * is alive and detect a stall at a glance.
   */
  onActivity?(activity: RunnerActivity): void;
  /** A cell attempt failed and the runner is about to retry it (`attempt` is the one starting, 2-based). */
  onCellRetry?(cellId: string, attempt: number, error: NonNullable<BenchCellResult['error']>): void;
  onPhase?(phase: string): void;
}

/** Inputs to a suite run. */
export interface RunSuiteOptions {
  suite: BenchSuiteId;
  cells: PlannedCell[];
  policy: RunPolicy;
  llmAdapters: ReadonlyMap<string, LLMRuntimeAdapter>;
  embedAdapters: ReadonlyMap<string, EmbeddingRuntimeAdapter>;
  harness: HarnessInfo;
  hooks?: RunnerHooks;
  abortSignal?: AbortSignal;
  /** Skip the fingerprint microbenchmark (tests only; submissions require it). */
  skipFingerprint?: boolean;
  userReportedDevice?: string;
  /** Trace recorder to use instead of a fresh one (tests drive its visibility). */
  trace?: TraceLike;
}

/** The trace recorder surface the runner needs. */
export type TraceLike = Pick<
  TraceRecorder,
  'attach' | 'dispose' | 'record' | 'isHidden' | 'pressureState' | 'all'
>;

/**
 * Run a benchmark suite and return the full, submittable result (raw traces
 * included; `clientSummaries` computed with the same code the server uses).
 *
 * Cells are grouped by (runtime, model): the model loads once, its workloads
 * run back-to-back, then it is disposed before the next model (peak-memory
 * hygiene). Validity gates never retry silently — affected iterations carry
 * their gate events and the cell is marked invalid.
 *
 * @throws {DOMException} AbortError when `abortSignal` aborts.
 * @example
 * const result = await runBenchmarkSuite({ suite: 'quick', cells, policy, ... });
 */
export async function runBenchmarkSuite(options: RunSuiteOptions): Promise<BenchRunResult> {
  const { policy, hooks, abortSignal } = options;
  const trace: TraceLike = options.trace ?? new TraceRecorder();
  await trace.attach();
  trace.record('suite-start', options.suite);

  const memApi = memoryApiAvailable();
  const cells: BenchCellResult[] = [];

  try {
    hooks?.onPhase?.('environment');
    const environment = await captureEnvironment({
      userReportedDevice: options.userReportedDevice,
    });
    hooks?.onEnvironment?.(environment);

    hooks?.onPhase?.('fingerprint');
    throwIfAborted(abortSignal);
    const fingerprint = options.skipFingerprint ? null : await runFingerprint();

    const baselineMemory = memApi !== 'none' ? await sampleMemoryBytes() : null;

    // Deterministic protocol execution order (reproducibility), then group
    // cells so each (runtime, model) loads exactly once.
    const groups = groupCells(orderCells(options.cells));
    const totalCells = options.cells.length;
    let cellIndex = 0;

    for (const group of groups) {
      throwIfAborted(abortSignal);
      const groupCellsResults = await runModelGroup(group, {
        ...options,
        trace,
        memApi,
        baselineMemory,
        cellIndexRef: () => cellIndex++,
        totalCells,
      });
      cells.push(...groupCellsResults);

      trace.record('cooldown-start');
      await sleep(policy.cooldownMs, abortSignal).catch((e) => {
        if ((e as Error).name === 'AbortError') throw e;
      });
      if (policy.pressureGate)
        await waitForPressure(trace, policy.pressureGateTimeoutMs, abortSignal);
      trace.record('cooldown-end');
    }

    trace.record('suite-end');
    const result: BenchRunResult = {
      protocol: BENCH_PROTOCOL_VERSION,
      schemaVersion: BENCH_SCHEMA_VERSION,
      runId: generateRunId(),
      createdAt: new Date().toISOString(),
      harness: options.harness,
      suite: options.suite,
      environment,
      fingerprint,
      cells,
      events: [...trace.all],
    };
    result.clientSummaries = summarizeRun(result, policy.highVarianceCv);
    return result;
  } finally {
    await trace.dispose();
  }
}

/** Cells grouped per (runtimeId, benchModelId + providerModelId). */
interface ModelGroup {
  key: string;
  model: BenchModelRef;
  /** Workloads that run against the loaded model. */
  workloads: Array<LLMWorkloadSpec | EmbedWorkloadSpec | QualityWorkloadSpec>;
  /** Planned cells recorded as skipped with a reason, never executed. */
  skipped: Array<{
    workload: LLMWorkloadSpec | EmbedWorkloadSpec | QualityWorkloadSpec;
    reason: string;
  }>;
}

function groupCells(cells: PlannedCell[]): ModelGroup[] {
  const map = new Map<string, ModelGroup>();
  for (const cell of cells) {
    const key = `${cell.model.runtimeId}/${cell.model.benchModelId}/${cell.model.providerModelId}`;
    let group = map.get(key);
    if (!group) {
      group = { key, model: cell.model, workloads: [], skipped: [] };
      map.set(key, group);
    }
    if (cell.skipReason) group.skipped.push({ workload: cell.workload, reason: cell.skipReason });
    else group.workloads.push(cell.workload);
  }
  return [...map.values()];
}

interface GroupContext extends RunSuiteOptions {
  trace: TraceLike;
  memApi: MemorySample['api'];
  baselineMemory: number | null;
  cellIndexRef: () => number;
  totalCells: number;
}

/** Load one model, run all its workloads, dispose. Errors isolate per group. */
async function runModelGroup(group: ModelGroup, ctx: GroupContext): Promise<BenchCellResult[]> {
  const { model } = group;
  const isEmbedding = model.task === 'embedding';
  const adapter = isEmbedding
    ? ctx.embedAdapters.get(model.runtimeId)
    : ctx.llmAdapters.get(model.runtimeId);

  const results: BenchCellResult[] = [];
  const baseCell = (workload: ModelGroup['workloads'][number]): BenchCellResult => ({
    cellId: `${model.runtimeId}/${model.benchModelId}/${workload.id}`,
    runtimeId: model.runtimeId,
    runtimeVersion: adapter?.runtimeVersion,
    model,
    workloadId: workload.id,
    workloadKind: workload.kind,
    resolvedBackend: 'unknown',
    load: null,
    iterations: [],
    status: 'skipped',
  });

  for (const { workload, reason } of group.skipped) {
    const cell = baseCell(workload);
    cell.invalidReasons = [reason];
    results.push(finishCell(cell, ctx));
  }
  if (group.workloads.length === 0) return results;

  if (!adapter) {
    for (const workload of group.workloads) {
      const cell = baseCell(workload);
      cell.invalidReasons = [`no adapter registered for ${model.runtimeId}`];
      results.push(finishCell(cell, ctx));
    }
    return results;
  }

  const availability = await adapter.isAvailable();
  if (!availability.ok) {
    for (const workload of group.workloads) {
      const cell = baseCell(workload);
      cell.invalidReasons = [`runtime unavailable: ${availability.reason ?? 'unknown'}`];
      results.push(finishCell(cell, ctx));
    }
    return results;
  }

  // Load phase (recorded once, attached to the group's first cell). A load
  // whose progress stalls is aborted by the watchdog and retried once; every
  // failed attempt stays on the cells.
  let loaded: LoadedLLM | LoadedEmbedder | null = null;
  let loadRecord: LoadRecord | null = null;
  let warmupMs: number | undefined;
  let postLoadMemory: number | null = null;
  const loadAttempts: NonNullable<BenchCellResult['attempts']> = [];
  const firstCellId = `${model.runtimeId}/${model.benchModelId}/${group.workloads[0].id}`;

  for (let attempt = 1; attempt <= Math.max(1, ctx.policy.maxAttempts); attempt++) {
    try {
      throwIfAborted(ctx.abortSignal);
      const cached = await adapter.isModelCached(model);
      const progress: Array<{ t: number; pct: number }> = [];
      const loadStart = hrNow();
      ctx.hooks?.onActivity?.({ cellId: firstCellId, phase: 'load' });
      loaded = await withWatchdog<LoadedLLM | LoadedEmbedder>(
        (signal, kick) =>
          adapter.load(model, {
            abortSignal: signal,
            onProgress: (p) => {
              kick();
              if (
                typeof p.pct === 'number' &&
                (progress.length === 0 || p.pct - progress[progress.length - 1].pct >= 2)
              ) {
                progress.push({ t: hrNow(), pct: Math.round(p.pct * 100) / 100 });
              }
              ctx.hooks?.onLoadProgress?.(firstCellId, p.pct);
              ctx.hooks?.onActivity?.({ cellId: firstCellId, phase: 'load', pct: p.pct });
            },
          }),
        {
          parent: ctx.abortSignal,
          stallMs: ctx.policy.loadStallMs,
          timeoutMs: ctx.policy.loadTimeoutMs,
          what: 'load',
        }
      );
      const loadEnd = hrNow();
      loadRecord = {
        cached,
        startT: loadStart,
        endT: loadEnd,
        progress: progress.length > 0 ? decimate(progress, 50) : undefined,
        declaredBytes: model.sizeBytes,
      };

      if (ctx.memApi !== 'none') postLoadMemory = await sampleMemoryBytes();

      // Untimed warmup (absorbs shader compilation / JIT / first-inference costs).
      if (ctx.policy.warmupRuns > 0) {
        const warmupStart = hrNow();
        for (let i = 0; i < ctx.policy.warmupRuns; i++) {
          throwIfAborted(ctx.abortSignal);
          const live = loaded;
          ctx.hooks?.onActivity?.({
            cellId: firstCellId,
            phase: 'warmup',
            iteration: i + 1,
            total: ctx.policy.warmupRuns,
            chars: 0,
            chunks: 0,
          });
          await withWatchdog<unknown>(
            (signal, kick) =>
              isEmbedding
                ? (live as LoadedEmbedder).model.doEmbed({
                    values: ['warmup probe'],
                    abortSignal: signal,
                  })
                : consumeStream(
                    (live as LoadedLLM).model,
                    { prompt: 'Reply with the single word: ready', maxTokens: 4, temperature: 0 },
                    signal,
                    (chars, chunks) => {
                      kick();
                      ctx.hooks?.onActivity?.({
                        cellId: firstCellId,
                        phase: 'warmup',
                        chars,
                        chunks,
                      });
                    }
                  ),
            {
              parent: ctx.abortSignal,
              stallMs: ctx.policy.chunkStallMs,
              timeoutMs: ctx.policy.iterationTimeoutMs,
              what: 'warmup',
            }
          );
          ctx.hooks?.onActivity?.({
            cellId: firstCellId,
            phase: 'warmup',
            iteration: i + 1,
            total: ctx.policy.warmupRuns,
          });
        }
        warmupMs = hrNow() - warmupStart;
      }
      break;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        if (loaded) await safeDispose(loaded);
        throw error;
      }
      if (loaded) await safeDispose(loaded);
      loaded = null;
      const described = describeError(error);
      if (described.name === 'TimeoutError')
        ctx.trace.record('cell-timeout', `${firstCellId}: ${described.message}`);
      if (attempt < Math.max(1, ctx.policy.maxAttempts)) {
        loadAttempts.push({ error: described, at: hrNow() });
        ctx.trace.record('cell-retry', `${firstCellId} attempt ${attempt + 1}`);
        ctx.hooks?.onCellRetry?.(firstCellId, attempt + 1, described);
        continue;
      }
      const atError = ctx.memApi !== 'none' ? await sampleMemoryBytes(5_000) : null;
      for (const workload of group.workloads) {
        const cell = baseCell(workload);
        cell.status = 'error';
        cell.load = loadRecord;
        cell.error = described;
        if (loadAttempts.length > 0) cell.attempts = [...loadAttempts];
        if (ctx.memApi !== 'none') {
          cell.memory = {
            api: ctx.memApi,
            baseline: ctx.baselineMemory ?? undefined,
            postLoad: postLoadMemory ?? undefined,
            atError: atError ?? undefined,
          };
        }
        results.push(finishCell(cell, ctx));
      }
      return results;
    }
  }
  if (!loaded) return results;

  // Workload cells over the live model. A cell that errors or times out is
  // retried up to the policy's maxAttempts with every failed attempt kept on
  // the cell; the run then moves on either way.
  let attachedLoad = false;
  for (const workload of group.workloads) {
    throwIfAborted(ctx.abortSignal);
    const cell = baseCell(workload);
    cell.resolvedBackend = loaded.resolvedBackend;
    if (loaded.runtimeConfig) cell.runtimeConfig = { ...loaded.runtimeConfig };
    if (!attachedLoad) {
      cell.load = loadRecord;
      cell.warmupMs = warmupMs;
      if (loadAttempts.length > 0) cell.attempts = [...loadAttempts];
      attachedLoad = true;
    }
    const index = ctx.cellIndexRef();
    ctx.hooks?.onCellStart?.(cell.cellId, index, ctx.totalCells);

    const live = loaded;
    const runOnce = async (): Promise<void> => {
      switch (workload.kind) {
        case 'llm-generate':
          await runLLMCell(cell, live as LoadedLLM, workload, ctx);
          break;
        case 'embed-single':
        case 'embed-batch':
          await runEmbedCell(cell, live as LoadedEmbedder, workload, ctx);
          break;
        case 'quality-mmlu': {
          const total = workload.items;
          cell.quality = await withWatchdog(
            (signal, kick) =>
              runMMLUFidelity((live as LoadedLLM).model, total, {
                abortSignal: signal,
                onProgress: (done) => {
                  kick();
                  ctx.hooks?.onIteration?.(cell.cellId, done, total);
                  ctx.hooks?.onActivity?.({
                    cellId: cell.cellId,
                    phase: 'quality',
                    iteration: done,
                    total,
                  });
                },
                promptSuffix: model.qualityPromptSuffix,
              }),
            {
              parent: ctx.abortSignal,
              stallMs: ctx.policy.chunkStallMs,
              timeoutMs: ctx.policy.qualityTimeoutMs,
              what: 'quality lane',
            }
          );
          cell.status = 'ok';
          break;
        }
        case 'quality-sts': {
          const total = workload.items;
          cell.quality = await withWatchdog(
            (signal, kick) =>
              runSTSQuality((live as LoadedEmbedder).model, total, {
                abortSignal: signal,
                onProgress: (done) => {
                  kick();
                  ctx.hooks?.onIteration?.(cell.cellId, done, total);
                  ctx.hooks?.onActivity?.({
                    cellId: cell.cellId,
                    phase: 'quality',
                    iteration: done,
                    total,
                  });
                },
              }),
            {
              parent: ctx.abortSignal,
              stallMs: ctx.policy.chunkStallMs,
              timeoutMs: ctx.policy.qualityTimeoutMs,
              what: 'quality lane',
            }
          );
          cell.status = 'ok';
          break;
        }
      }
    };

    const maxAttempts = Math.max(1, ctx.policy.maxAttempts);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await runOnce();
        break;
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          await safeDispose(loaded);
          throw error;
        }
        const described = describeError(error);
        if (described.name === 'TimeoutError')
          ctx.trace.record('cell-timeout', `${cell.cellId}: ${described.message}`);
        if (attempt < maxAttempts) {
          cell.attempts = [...(cell.attempts ?? []), { error: described, at: hrNow() }];
          cell.iterations = [];
          cell.quality = undefined;
          cell.invalidReasons = undefined;
          cell.status = 'skipped';
          ctx.trace.record('cell-retry', `${cell.cellId} attempt ${attempt + 1}`);
          ctx.hooks?.onCellRetry?.(cell.cellId, attempt + 1, described);
          continue;
        }
        cell.status = 'error';
        cell.error = described;
      }
    }

    if (ctx.memApi !== 'none' && (cell.status === 'ok' || cell.status === 'error')) {
      const sample = await sampleMemoryBytes(5_000);
      cell.memory = {
        api: ctx.memApi,
        baseline: ctx.baselineMemory ?? undefined,
        postLoad: postLoadMemory ?? undefined,
        ...(cell.status === 'ok'
          ? { postRun: sample ?? undefined }
          : { atError: sample ?? undefined }),
      };
    }
    results.push(finishCell(cell, ctx));
  }

  await safeDispose(loaded);

  // Warm-reload lane: after a cold load, reload to measure the cache-hit path.
  if (ctx.policy.measureWarmReload && loadRecord?.cached === false) {
    try {
      throwIfAborted(ctx.abortSignal);
      const reloadCellId = `${model.runtimeId}/${model.benchModelId}/warm-reload`;
      ctx.hooks?.onActivity?.({ cellId: reloadCellId, phase: 'reload' });
      const start = hrNow();
      const reloaded = await withWatchdog<LoadedLLM | LoadedEmbedder>(
        (signal, kick) =>
          adapter.load(model, {
            abortSignal: signal,
            onProgress: (p) => {
              kick();
              ctx.hooks?.onActivity?.({ cellId: reloadCellId, phase: 'reload', pct: p.pct });
            },
          }),
        {
          parent: ctx.abortSignal,
          stallMs: ctx.policy.loadStallMs,
          timeoutMs: ctx.policy.loadTimeoutMs,
          what: 'load',
        }
      );
      const end = hrNow();
      await safeDispose(reloaded);
      const warmCell: BenchCellResult = {
        cellId: `${model.runtimeId}/${model.benchModelId}/warm-reload`,
        runtimeId: model.runtimeId,
        runtimeVersion: adapter.runtimeVersion,
        model,
        workloadId: 'warm-reload',
        workloadKind: 'llm-generate',
        resolvedBackend: reloaded.resolvedBackend,
        ...(reloaded.runtimeConfig ? { runtimeConfig: { ...reloaded.runtimeConfig } } : {}),
        load: { cached: true, startT: start, endT: end, declaredBytes: model.sizeBytes },
        iterations: [],
        status: 'ok',
      };
      results.push(finishCell(warmCell, ctx));
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error;
      // Warm-reload is auxiliary; a failure here never invalidates the group.
    }
  }

  return results;
}

/** Timed LLM iterations with raw chunk traces. */
async function runLLMCell(
  cell: BenchCellResult,
  loaded: LoadedLLM,
  workload: LLMWorkloadSpec,
  ctx: GroupContext
): Promise<void> {
  const iterations: LLMIteration[] = [];
  const discarded: LLMIteration[] = [];
  for (let i = 0; i < ctx.policy.timedRuns; i++) {
    const iteration = i + 1;
    for (let redo = 0; ; redo++) {
      throwIfAborted(ctx.abortSignal);
      ctx.hooks?.onIteration?.(cell.cellId, iteration, ctx.policy.timedRuns);
      await waitForVisible(ctx, cell.cellId);
      const gates: string[] = [];
      if (ctx.trace.isHidden) gates.push('started-hidden');
      const hiddenBefore = countHidden(ctx.trace);

      ctx.hooks?.onActivity?.({
        cellId: cell.cellId,
        phase: 'iteration',
        iteration,
        total: ctx.policy.timedRuns,
        chars: 0,
        chunks: 0,
      });
      const startT = hrNow();
      const { chunks, text, providerUsage, finishReason } = await withWatchdog(
        (signal, kick) =>
          consumeStream(
            loaded.model,
            {
              prompt: workload.prompt,
              systemPrompt: workload.systemPrompt,
              maxTokens: workload.maxTokens,
              temperature: workload.temperature,
            },
            signal,
            (chars, count) => {
              kick();
              ctx.hooks?.onActivity?.({
                cellId: cell.cellId,
                phase: 'iteration',
                iteration,
                total: ctx.policy.timedRuns,
                chars,
                chunks: count,
              });
            }
          ),
        {
          parent: ctx.abortSignal,
          stallMs: ctx.policy.chunkStallMs,
          timeoutMs: ctx.policy.iterationTimeoutMs,
          what: `iteration ${iteration}`,
        }
      );
      const endT = hrNow();
      if (countHidden(ctx.trace) > hiddenBefore) gates.push('hidden-during-run');
      if (text.length < MIN_GENERATED_CHARS) gates.push('degenerate-output');

      const record: LLMIteration = {
        startT,
        chunks,
        endT,
        text,
        providerUsage: providerUsage
          ? { ...providerUsage, fidelity: USAGE_FIDELITY[cell.runtimeId] }
          : undefined,
        finishReason,
        gates,
      };
      // A tab hidden during the iteration measured browser scheduling, not the
      // runtime: keep that iteration on record, wait for the tab, and repeat it.
      if (hiddenGate(gates) && redo < Math.max(1, ctx.policy.maxAttempts)) {
        discarded.push(record);
        ctx.trace.record(
          'iteration-redo',
          `${cell.cellId} iteration ${iteration}: ${gates.join(',')}`
        );
        continue;
      }
      iterations.push(record);
      break;
    }
  }
  cell.iterations = iterations;
  if (discarded.length > 0) cell.discardedIterations = discarded;
  finishTimedCell(cell, iterations);
}

/** True when a visibility gate fired on an iteration. */
function hiddenGate(gates: string[]): boolean {
  return gates.includes('started-hidden') || gates.includes('hidden-during-run');
}

/** Status + reasons for a timed cell from its kept iterations. */
function finishTimedCell(cell: BenchCellResult, iterations: Array<{ gates: string[] }>): void {
  const gated = iterations.some((it) => it.gates.length > 0);
  cell.status = gated ? 'invalid' : 'ok';
  if (gated) {
    const reasons = new Set<string>();
    for (const it of iterations) {
      for (const gate of it.gates) {
        reasons.add(
          gate === 'degenerate-output'
            ? `degenerate output: fewer than ${MIN_GENERATED_CHARS} generated chars in a timed iteration`
            : gate === 'started-hidden' || gate === 'hidden-during-run'
              ? 'tab hidden during a timed iteration (the tab did not return in time for a repeat)'
              : 'validity gate fired during a timed region'
        );
      }
    }
    cell.invalidReasons = [...reasons];
  }
}

/**
 * Wait, up to the policy's `visibilityWaitMs`, for a hidden tab to be visible
 * again before a timed region starts; the host is told so it can ask the
 * participant to come back. Returns whether the tab is visible.
 */
async function waitForVisible(ctx: GroupContext, cellId: string): Promise<boolean> {
  if (!ctx.trace.isHidden) return true;
  ctx.hooks?.onActivity?.({ cellId, phase: 'waiting-visible' });
  const deadline = hrNow() + ctx.policy.visibilityWaitMs;
  while (ctx.trace.isHidden && hrNow() < deadline) {
    throwIfAborted(ctx.abortSignal);
    await sleep(Math.min(250, ctx.policy.visibilityWaitMs), ctx.abortSignal);
  }
  return !ctx.trace.isHidden;
}

/** Timed embedding iterations. */
async function runEmbedCell(
  cell: BenchCellResult,
  loaded: LoadedEmbedder,
  workload: EmbedWorkloadSpec,
  ctx: GroupContext
): Promise<void> {
  const iterations: EmbedIteration[] = [];
  const discarded: EmbedIteration[] = [];
  for (let i = 0; i < ctx.policy.timedRuns; i++) {
    for (let redo = 0; ; redo++) {
      throwIfAborted(ctx.abortSignal);
      ctx.hooks?.onIteration?.(cell.cellId, i + 1, ctx.policy.timedRuns);
      await waitForVisible(ctx, cell.cellId);
      const gates: string[] = [];
      if (ctx.trace.isHidden) gates.push('started-hidden');
      const hiddenBefore = countHidden(ctx.trace);

      const startT = hrNow();
      const { embeddings } = await withWatchdog(
        (signal) => loaded.model.doEmbed({ values: workload.texts, abortSignal: signal }),
        {
          parent: ctx.abortSignal,
          stallMs: ctx.policy.iterationTimeoutMs,
          timeoutMs: ctx.policy.iterationTimeoutMs,
          what: `iteration ${i + 1}`,
        }
      );
      const endT = hrNow();
      if (countHidden(ctx.trace) > hiddenBefore) gates.push('hidden-during-run');
      ctx.hooks?.onActivity?.({
        cellId: cell.cellId,
        phase: 'iteration',
        iteration: i + 1,
        total: ctx.policy.timedRuns,
      });

      const record: EmbedIteration = {
        startT,
        endT,
        count: workload.texts.length,
        dimensions: embeddings[0]?.length ?? loaded.model.dimensions,
        gates,
      };
      if (hiddenGate(gates) && redo < Math.max(1, ctx.policy.maxAttempts)) {
        discarded.push(record);
        ctx.trace.record('iteration-redo', `${cell.cellId} iteration ${i + 1}: ${gates.join(',')}`);
        continue;
      }
      iterations.push(record);
      break;
    }
  }
  cell.iterations = iterations;
  if (discarded.length > 0) cell.discardedIterations = discarded;
  finishTimedCell(cell, iterations);
}

/** Drain a model stream, timestamping every chunk (falls back to doGenerate). */
async function consumeStream(
  model: LoadedLLM['model'],
  options: { prompt: string; systemPrompt?: string; maxTokens: number; temperature: number },
  abortSignal?: AbortSignal,
  onChunk?: (chars: number, chunks: number) => void
): Promise<{
  chunks: Array<{ t: number; c: number }>;
  text: string;
  providerUsage?: Omit<import('./types.js').ProviderUsage, 'fidelity'>;
  finishReason?: string;
}> {
  const chunks: Array<{ t: number; c: number }> = [];
  let text = '';
  let providerUsage: Omit<import('./types.js').ProviderUsage, 'fidelity'> | undefined;
  let finishReason: string | undefined;

  if (model.doStream) {
    for await (const chunk of model.doStream({ ...options, abortSignal })) {
      const t = hrNow();
      if (chunk.text.length > 0) {
        chunks.push({ t, c: chunk.text.length });
        text += chunk.text;
        onChunk?.(text.length, chunks.length);
      }
      if (chunk.done) {
        providerUsage = chunk.usage;
        finishReason = chunk.finishReason;
      }
    }
  } else {
    const result = await model.doGenerate({ ...options, abortSignal });
    const t = hrNow();
    text = result.text;
    chunks.push({ t, c: result.text.length });
    onChunk?.(text.length, chunks.length);
    providerUsage = result.usage;
    finishReason = result.finishReason;
  }
  return { chunks, text, providerUsage, finishReason };
}

/** A watchdog verdict: the guarded work stalled or overran its budget. */
class BenchTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Run `work` under a stall and an absolute deadline. `kick()` marks progress
 * (a streamed chunk, a load progress event, a finished quality item); when no
 * kick arrives for `stallMs`, or the work outlives `timeoutMs`, the child
 * signal aborts and the call rejects with a TimeoutError. The checks compare
 * timestamps when a timer fires, so a main thread blocked by WASM compute (no
 * timer can run while it computes, and no kick either) is judged on the
 * progress it reports once it yields, not on the time the timer slept.
 */
async function withWatchdog<T>(
  work: (signal: AbortSignal, kick: () => void) => Promise<T>,
  budget: { parent?: AbortSignal; stallMs: number; timeoutMs: number; what: string }
): Promise<T> {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort(budget.parent?.reason);
  if (budget.parent?.aborted) onParentAbort();
  budget.parent?.addEventListener('abort', onParentAbort, { once: true });

  const startedAt = hrNow();
  let lastKick = startedAt;
  let settled = false;
  let rejectTimeout: (error: Error) => void = () => {};
  const timeout = new Promise<never>((_, reject) => {
    rejectTimeout = reject;
  });
  const fail = (message: string) => {
    if (settled) return;
    settled = true;
    controller.abort(new BenchTimeoutError(message));
    rejectTimeout(new BenchTimeoutError(message));
  };
  const check = () => {
    if (settled) return;
    const now = hrNow();
    if (now - lastKick >= budget.stallMs) {
      fail(
        budget.what === 'load'
          ? `load made no progress for ${budget.stallMs} ms`
          : `${budget.what}: no stream progress for ${budget.stallMs} ms`
      );
      return;
    }
    if (now - startedAt >= budget.timeoutMs) {
      fail(`${budget.what}: exceeded the ${budget.timeoutMs} ms budget`);
    }
  };
  // Poll at a fraction of the stall budget so the verdict lands promptly.
  const interval = setInterval(check, Math.max(10, Math.min(budget.stallMs, budget.timeoutMs) / 4));
  const kick = () => {
    lastKick = hrNow();
  };
  try {
    return await Promise.race([work(controller.signal, kick), timeout]);
  } finally {
    settled = true;
    clearInterval(interval);
    budget.parent?.removeEventListener('abort', onParentAbort);
  }
}

/** Count visibility-hidden events recorded so far. */
function countHidden(trace: TraceLike): number {
  let n = 0;
  for (const e of trace.all) if (e.type === 'visibility-hidden') n++;
  return n;
}

/** Wait until compute pressure recovers to nominal/fair (best-effort). */
async function waitForPressure(
  trace: TraceLike,
  timeoutMs: number,
  abortSignal?: AbortSignal
): Promise<void> {
  const deadline = hrNow() + timeoutMs;
  while (hrNow() < deadline) {
    const state = trace.pressureState;
    if (state === undefined || state === 'nominal' || state === 'fair') return;
    await sleep(1_000, abortSignal);
  }
}

/** Downsample a progress array to at most `max` entries (keeps endpoints). */
function decimate<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const out: T[] = [];
  const step = (items.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(items[Math.round(i * step)]);
  return out;
}

/** Longest cause stack kept on a cell; a WASM abort's decoded frames fit well within it. */
const CAUSE_STACK_CAP = 4_000;

/**
 * Serialize an error for a cell, keeping the wrapped provider cause's message,
 * name, and stack: a WASM runtime abort (wllama's `RuntimeError` "(ABORT) ")
 * names the failing native frame only in its decoded stack.
 */
function describeError(error: unknown): NonNullable<BenchCellResult['error']> {
  const e = error as { name?: string; message?: string; cause?: unknown } | undefined;
  const cause = e?.cause;
  const causeMessage =
    cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : undefined;
  const causeName =
    cause instanceof Error && cause.name && cause.name !== 'Error' ? cause.name : undefined;
  const causeStack =
    cause instanceof Error && typeof cause.stack === 'string' && cause.stack.length > 0
      ? cause.stack.slice(0, CAUSE_STACK_CAP)
      : undefined;
  return {
    name: e?.name ?? 'Error',
    message: e?.message ?? String(error),
    ...(causeMessage !== undefined ? { cause: causeMessage } : {}),
    ...(causeName ? { causeName } : {}),
    ...(causeStack ? { causeStack } : {}),
  };
}

function finishCell(cell: BenchCellResult, ctx: GroupContext): BenchCellResult {
  ctx.hooks?.onCellFinish?.(cell);
  return cell;
}

async function safeDispose(loaded: LoadedLLM | LoadedEmbedder): Promise<void> {
  try {
    await loaded.dispose();
  } catch {
    // Disposal failures must never corrupt a completed result.
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortDomException();
}

/** UUID v4 via Web Crypto, with a deterministic-format fallback. */
function generateRunId(): string {
  const cryptoObj = globalThis.crypto as Crypto | undefined;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  const bytes = new Uint8Array(16);
  if (cryptoObj?.getRandomValues) cryptoObj.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
