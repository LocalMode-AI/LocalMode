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

/** Progress callbacks for a host UI. */
export interface RunnerHooks {
  /** The environment capture, before the fingerprint and the first cell (lets a host persist partial progress). */
  onEnvironment?(environment: EnvironmentCapture): void;
  onCellStart?(cellId: string, index: number, total: number): void;
  onCellFinish?(cell: BenchCellResult): void;
  onLoadProgress?(cellId: string, pct: number | undefined): void;
  onIteration?(cellId: string, iteration: number, total: number): void;
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
}

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
  const trace = new TraceRecorder();
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
      if (policy.pressureGate) await waitForPressure(trace, policy.pressureGateTimeoutMs, abortSignal);
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
  skipped: Array<{ workload: LLMWorkloadSpec | EmbedWorkloadSpec | QualityWorkloadSpec; reason: string }>;
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
  trace: TraceRecorder;
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

  // Load phase (recorded once, attached to the group's first cell).
  let loaded: LoadedLLM | LoadedEmbedder | null = null;
  let loadRecord: LoadRecord | null = null;
  let warmupMs: number | undefined;
  let postLoadMemory: number | null = null;

  try {
    throwIfAborted(ctx.abortSignal);
    const cached = await adapter.isModelCached(model);
    const progress: Array<{ t: number; pct: number }> = [];
    const loadStart = hrNow();
    const firstCellId = `${model.runtimeId}/${model.benchModelId}/${group.workloads[0].id}`;
    loaded = await adapter.load(model, {
      abortSignal: ctx.abortSignal,
      onProgress: (p) => {
        if (typeof p.pct === 'number' && (progress.length === 0 || p.pct - progress[progress.length - 1].pct >= 2)) {
          progress.push({ t: hrNow(), pct: Math.round(p.pct * 100) / 100 });
        }
        ctx.hooks?.onLoadProgress?.(firstCellId, p.pct);
      },
    });
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
        if (isEmbedding) {
          await (loaded as LoadedEmbedder).model.doEmbed({
            values: ['warmup probe'],
            abortSignal: ctx.abortSignal,
          });
        } else {
          await consumeStream(
            (loaded as LoadedLLM).model,
            { prompt: 'Reply with the single word: ready', maxTokens: 4, temperature: 0 },
            ctx.abortSignal,
          );
        }
      }
      warmupMs = hrNow() - warmupStart;
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      if (loaded) await safeDispose(loaded);
      throw error;
    }
    const atError = ctx.memApi !== 'none' ? await sampleMemoryBytes(5_000) : null;
    for (const workload of group.workloads) {
      const cell = baseCell(workload);
      cell.status = 'error';
      cell.load = loadRecord;
      cell.error = describeError(error);
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
    if (loaded) await safeDispose(loaded);
    return results;
  }

  // Workload cells over the live model.
  let attachedLoad = false;
  for (const workload of group.workloads) {
    throwIfAborted(ctx.abortSignal);
    const cell = baseCell(workload);
    cell.resolvedBackend = loaded.resolvedBackend;
    if (!attachedLoad) {
      cell.load = loadRecord;
      cell.warmupMs = warmupMs;
      attachedLoad = true;
    }
    const index = ctx.cellIndexRef();
    ctx.hooks?.onCellStart?.(cell.cellId, index, ctx.totalCells);

    try {
      switch (workload.kind) {
        case 'llm-generate':
          await runLLMCell(cell, loaded as LoadedLLM, workload, ctx);
          break;
        case 'embed-single':
        case 'embed-batch':
          await runEmbedCell(cell, loaded as LoadedEmbedder, workload, ctx);
          break;
        case 'quality-mmlu': {
          const total = workload.items;
          cell.quality = await runMMLUFidelity((loaded as LoadedLLM).model, total, {
            abortSignal: ctx.abortSignal,
            onProgress: (done) => ctx.hooks?.onIteration?.(cell.cellId, done, total),
            promptSuffix: model.qualityPromptSuffix,
          });
          cell.status = 'ok';
          break;
        }
        case 'quality-sts': {
          const total = workload.items;
          cell.quality = await runSTSQuality((loaded as LoadedEmbedder).model, total, {
            abortSignal: ctx.abortSignal,
            onProgress: (done) => ctx.hooks?.onIteration?.(cell.cellId, done, total),
          });
          cell.status = 'ok';
          break;
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        await safeDispose(loaded);
        throw error;
      }
      cell.status = 'error';
      cell.error = describeError(error);
    }

    if (ctx.memApi !== 'none' && (cell.status === 'ok' || cell.status === 'error')) {
      const sample = await sampleMemoryBytes(5_000);
      cell.memory = {
        api: ctx.memApi,
        baseline: ctx.baselineMemory ?? undefined,
        postLoad: postLoadMemory ?? undefined,
        ...(cell.status === 'ok' ? { postRun: sample ?? undefined } : { atError: sample ?? undefined }),
      };
    }
    results.push(finishCell(cell, ctx));
  }

  await safeDispose(loaded);

  // Warm-reload lane: after a cold load, reload to measure the cache-hit path.
  if (ctx.policy.measureWarmReload && loadRecord?.cached === false) {
    try {
      throwIfAborted(ctx.abortSignal);
      const start = hrNow();
      const reloaded = await adapter.load(model, { abortSignal: ctx.abortSignal });
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
  ctx: GroupContext,
): Promise<void> {
  const iterations: LLMIteration[] = [];
  for (let i = 0; i < ctx.policy.timedRuns; i++) {
    throwIfAborted(ctx.abortSignal);
    ctx.hooks?.onIteration?.(cell.cellId, i + 1, ctx.policy.timedRuns);
    const gates: string[] = [];
    if (ctx.trace.isHidden) gates.push('started-hidden');
    const hiddenBefore = countHidden(ctx.trace);

    const startT = hrNow();
    const { chunks, text, providerUsage, finishReason } = await consumeStream(
      loaded.model,
      {
        prompt: workload.prompt,
        systemPrompt: workload.systemPrompt,
        maxTokens: workload.maxTokens,
        temperature: workload.temperature,
      },
      ctx.abortSignal,
    );
    const endT = hrNow();
    if (countHidden(ctx.trace) > hiddenBefore) gates.push('hidden-during-run');
    if (text.length < MIN_GENERATED_CHARS) gates.push('degenerate-output');

    iterations.push({
      startT,
      chunks,
      endT,
      text,
      providerUsage: providerUsage
        ? { ...providerUsage, fidelity: USAGE_FIDELITY[cell.runtimeId] }
        : undefined,
      finishReason,
      gates,
    });
  }
  cell.iterations = iterations;
  const gated = iterations.some((it) => it.gates.length > 0);
  cell.status = gated ? 'invalid' : 'ok';
  if (gated) {
    const reasons = new Set<string>();
    for (const it of iterations) {
      for (const gate of it.gates) {
        reasons.add(
          gate === 'degenerate-output'
            ? `degenerate output: fewer than ${MIN_GENERATED_CHARS} generated chars in a timed iteration`
            : 'validity gate fired during a timed region',
        );
      }
    }
    cell.invalidReasons = [...reasons];
  }
}

/** Timed embedding iterations. */
async function runEmbedCell(
  cell: BenchCellResult,
  loaded: LoadedEmbedder,
  workload: EmbedWorkloadSpec,
  ctx: GroupContext,
): Promise<void> {
  const iterations: EmbedIteration[] = [];
  for (let i = 0; i < ctx.policy.timedRuns; i++) {
    throwIfAborted(ctx.abortSignal);
    ctx.hooks?.onIteration?.(cell.cellId, i + 1, ctx.policy.timedRuns);
    const gates: string[] = [];
    if (ctx.trace.isHidden) gates.push('started-hidden');
    const hiddenBefore = countHidden(ctx.trace);

    const startT = hrNow();
    const { embeddings } = await loaded.model.doEmbed({
      values: workload.texts,
      abortSignal: ctx.abortSignal,
    });
    const endT = hrNow();
    if (countHidden(ctx.trace) > hiddenBefore) gates.push('hidden-during-run');

    iterations.push({
      startT,
      endT,
      count: workload.texts.length,
      dimensions: embeddings[0]?.length ?? loaded.model.dimensions,
      gates,
    });
  }
  cell.iterations = iterations;
  const gated = iterations.some((it) => it.gates.length > 0);
  cell.status = gated ? 'invalid' : 'ok';
  if (gated) cell.invalidReasons = ['validity gate fired during a timed region'];
}

/** Drain a model stream, timestamping every chunk (falls back to doGenerate). */
async function consumeStream(
  model: LoadedLLM['model'],
  options: { prompt: string; systemPrompt?: string; maxTokens: number; temperature: number },
  abortSignal?: AbortSignal,
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
    providerUsage = result.usage;
    finishReason = result.finishReason;
  }
  return { chunks, text, providerUsage, finishReason };
}

/** Count visibility-hidden events recorded so far. */
function countHidden(trace: TraceRecorder): number {
  let n = 0;
  for (const e of trace.all) if (e.type === 'visibility-hidden') n++;
  return n;
}

/** Wait until compute pressure recovers to nominal/fair (best-effort). */
async function waitForPressure(
  trace: TraceRecorder,
  timeoutMs: number,
  abortSignal?: AbortSignal,
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
  const causeName = cause instanceof Error && cause.name && cause.name !== 'Error' ? cause.name : undefined;
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
