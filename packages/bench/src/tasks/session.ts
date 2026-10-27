/**
 * The task session runner of the `chrome-ai-tasks` control kind: one task,
 * one item list, the session's systems in `systemOrder`, one item per call.
 * Pure and adapter-injected like `runBenchmarkSuite` (the host supplies the
 * systems), but its own function: no warmup, no timed-iteration repeats, no
 * hidden-tab redo (visibility and focus are recorded, never redone), a
 * per-item watchdog that records a timeout as that item's error and moves
 * on, and a finalize handshake that lets the host add captures taken
 * outside the page before the digest is computed.
 */

import type {
  BenchCellResult,
  BenchModelRef,
  BenchRunResult,
  EnvironmentCapture,
  HarnessInfo,
  LoadRecord,
  TaskCellRecord,
  TaskComponentsCapture,
  TaskDetectCandidate,
  TaskIteration,
  TaskKind,
  TaskOnDeviceInternalsCapture,
  TaskSessionRecord,
} from '../types.js';
import { BENCH_PROTOCOL_VERSION, BENCH_SCHEMA_VERSION } from '../types.js';
import { captureEnvironment } from '../env.js';
import { runFingerprint } from '../fingerprint.js';
import { memoryApiAvailable, sampleMemoryBytes } from '../memory.js';
import { hrNow, sleep } from '../timing.js';
import { TraceRecorder } from '../trace.js';
import { summarizeRun } from '../validate.js';
import { computeRunDigest, sha256Hex } from '../canonical.js';
import {
  controlTasksError,
  TASK_DETECT_MAX_CANDIDATES,
  TASK_ITEM_WATCHDOG_MS,
  TASK_PRESSURE_GATE_MS,
  taskArmId,
} from './protocol.js';

/** One item of a task list, as the host loaded and verified it. */
export interface TaskItem {
  id: string;
  /** The text sent to the system. */
  text: string;
  /** SHA-256 hex of `text`. */
  sha256: string;
  /** Source and target language of a translation item (BCP 47). */
  src?: string;
  tgt?: string;
}

/** A cell the host plans: one system on one lane over one task workload. */
export interface TaskPlannedCell {
  /** `runtimeId` is the lane, `benchModelId` the system id, `task: 'task'`. */
  model: BenchModelRef;
  /** e.g. `summarize-cnndm-L`, `translate-en-de-S`, `detect-flores-L`. */
  workloadId: string;
  /** The items, in list order (empty on a download session). */
  items: TaskItem[];
}

/** What a system returns for one item. */
export interface TaskItemOutput {
  /**
   * `delta`: the chunks passed to `onChunk` are deltas and form the output.
   * `cumulative`: each chunk is the whole output so far (converted to deltas).
   * `none`: no stream; `text` is the output.
   */
  mode: 'delta' | 'cumulative' | 'none';
  /** The output (required for `none`; on a stream, checked against the chunks). */
  text?: string;
  /** Detector candidates (detect systems; capped at `TASK_DETECT_MAX_CANDIDATES`). */
  detect?: TaskDetectCandidate[];
  /** Target-language token the system prepended to the input. */
  targetToken?: string;
  /** Input size the system measured while running the item (e.g. the fallback tokenizer's count). */
  inputUsage?: { value: number; unit: 'chrome-quota' | 'tokens' };
  /**
   * The input-truncation record (`TaskIteration.inputTruncated`,
   * `inputTokens`, `modelMaxTokens`): the counts for a fallback with a
   * tokenizer, `null` for a system without one; absent leaves the fields out.
   */
  truncation?: { inputTruncated: boolean; inputTokens: number; modelMaxTokens: number } | null;
}

/** A system loaded for one cell. */
export interface LoadedTaskSystem {
  /** `TaskCellRecord.api`. */
  api: string;
  /** Backend actually used (`chrome-builtin`, `wasm`, `webgpu`). */
  resolvedBackend: string;
  runtimeVersion?: string;
  runtimeConfig?: Record<string, string | number | boolean>;
  /** Whether the model was already on the device before the load, when known. */
  cached?: boolean;
  /**
   * The span of a `create()` the host started before the session reached the
   * cell (inside the user activation of the Run click, which Chrome needs);
   * recorded as the cell's load instead of the time the load step waited.
   */
  loadSpan?: { startT: number; endT: number };
  availabilityAtCreate?: string;
  inputQuota?: number | null;
  /** A download the load triggered: the progress events and its wall time. */
  download?: { events: Array<{ t: number; loaded: number; total: number }>; wallMs: number };
  /** Untimed, before the item's request: the input's size in the system's own units. */
  measureInputUsage?(item: TaskItem, abortSignal: AbortSignal): Promise<{ value: number; unit: 'chrome-quota' | 'tokens' } | undefined>;
  /**
   * Run one item. Call `onChunk(text, t)` for each streamed chunk, `t` the
   * `performance.now()` of its receipt. Must honour `abortSignal`.
   */
  runItem(item: TaskItem, ctx: { abortSignal: AbortSignal; onChunk: (text: string, t: number) => void }): Promise<TaskItemOutput>;
  /**
   * Untimed, right after the load: check what was loaded (e.g. the SHA-256 of
   * every model file against its pin). Entries it returns join
   * `runtimeConfig`; a throw makes the cell an error cell and no item runs.
   */
  verify?(): Promise<Record<string, string | number | boolean> | void>;
  /** `availability()` after the cell's last item. */
  availability?(): Promise<string | undefined>;
  dispose(): Promise<void>;
}

/** A system the host supplies for one arm (`<runtimeId>/<systemId>`). */
export interface TaskSystemAdapter {
  /** `availability()` before the session touches the API (built-in systems). */
  availability?(cell: TaskPlannedCell): Promise<string | undefined>;
  /** `create()` or the model load, timed as the cell's `load`. */
  load(cell: TaskPlannedCell, ctx: { abortSignal: AbortSignal; onProgress: (pct: number | undefined) => void }): Promise<LoadedTaskSystem>;
}

/** Captures the host adds after the last item (the driver's end readings). */
export interface TaskFinalizeCaptures {
  components?: TaskComponentsCapture;
  onDeviceInternals?: TaskOnDeviceInternalsCapture;
  freeDiskBytes?: number;
  profileFolderBytes?: Record<string, number>;
  /** Profile bytes a cell's download added, by cell id (filled into `task.download.profileBytesDelta`). */
  profileBytesDeltaByCell?: Record<string, number>;
}

/** Progress callbacks of `runTaskSession`. */
export interface TaskSessionHooks {
  onPhase?(phase: 'environment' | 'fingerprint' | 'preflight' | 'cells' | 'finalize'): void;
  onEnvironment?(environment: EnvironmentCapture): void;
  onCellStart?(cell: TaskPlannedCell, index: number, total: number): void;
  onItem?(cellId: string, iteration: TaskIteration): void;
  onCellFinish?(cell: BenchCellResult): void;
}

/** Options of `runTaskSession`. */
export interface TaskSessionOptions {
  /** Harness identity; `control` must be a `chrome-ai-tasks` marker (`createHarnessControl`). */
  harness: HarnessInfo;
  cells: TaskPlannedCell[];
  /** One adapter per arm id (`taskArmId(runtimeId, systemId)`). */
  adapters: ReadonlyMap<string, TaskSystemAdapter>;
  /** Checks the host runs after the environment capture; a failure aborts the session with no result. */
  preflight?: () => Promise<{ ok: boolean; detail: string }>;
  /** Awaited before each cell's load (a download session waits for the click that starts the download). */
  beforeLoad?: (cell: TaskPlannedCell) => Promise<void>;
  /** Awaited after the last item; its captures enter the run before the digest. */
  finalize?: () => Promise<TaskFinalizeCaptures | undefined>;
  hooks?: TaskSessionHooks;
  /** Per-item watchdog per task, ms (default `TASK_ITEM_WATCHDOG_MS`). */
  watchdogMs?: Partial<Record<TaskKind, number>>;
  /** Longest wait for compute pressure to settle between systems (default `TASK_PRESSURE_GATE_MS`). */
  pressureGateMs?: number;
  /** Longest a cell's load may take (default 45 minutes, a download included). */
  loadTimeoutMs?: number;
  /** Longest one memory sample may take (default 5 s). */
  memorySampleTimeoutMs?: number;
  abortSignal?: AbortSignal;
  /** Tests only: a run without a fingerprint is flagged by the plausibility check. */
  skipFingerprint?: boolean;
  /** Trace recorder to use instead of a fresh one with focus tracking (tests). */
  trace?: Pick<TraceRecorder, 'attach' | 'dispose' | 'record' | 'pressureState' | 'all'>;
}

/** Thrown when the preflight fails: the session is not a sample and nothing is exported. */
export class TaskPreflightError extends Error {
  constructor(readonly detail: string) {
    super(`task session preflight failed: ${detail}`);
    this.name = 'TaskPreflightError';
  }
}

/** Default longest load (a download included). */
const DEFAULT_LOAD_TIMEOUT_MS = 45 * 60_000;

class TaskTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

function abortError(): Error {
  const e = new Error('The task session was aborted');
  e.name = 'AbortError';
  return e;
}

/** Race `work` against a timer; the timer aborts `controller` before rejecting. */
async function withDeadline<T>(work: Promise<T>, ms: number, controller: AbortController, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new TaskTimeoutError(`${what} took longer than ${ms} ms`));
        }, ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function describeError(error: unknown): { name: string; message: string; cause?: string } {
  const e = error as { name?: string; message?: string; cause?: unknown } | undefined;
  const cause = e?.cause;
  const causeText = cause instanceof Error ? `${cause.name}: ${cause.message}` : typeof cause === 'string' ? cause : undefined;
  return {
    name: (e?.name || 'Error').slice(0, 200),
    message: String(e?.message ?? error).slice(0, 4000),
    ...(causeText ? { cause: causeText.slice(0, 4000) } : {}),
  };
}

function decimate<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const out: T[] = [];
  const step = (items.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(items[Math.round(i * step)]);
  return out;
}

async function waitForPressure(
  trace: { pressureState: string | undefined },
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

function generateRunId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Turn the chunks a system delivered into the item's delta trace and output.
 * A cumulative stream is converted (each chunk minus the previous one); a
 * cumulative chunk that does not extend the previous one is kept whole and
 * gated `cumulative-not-prefix`. A delta stream whose joined chunks differ
 * from the text the system reported keeps the joined chunks (so the chunk sum
 * holds) and is gated `stream-text-mismatch`.
 */
function buildTrace(
  output: TaskItemOutput,
  raw: Array<{ text: string; t: number }>,
  endT: number,
): { text: string; chunks: Array<{ t: number; c: number }>; chunkMode: TaskIteration['chunkMode']; gates: string[] } {
  const gates: string[] = [];
  if (output.mode === 'none') {
    const text = output.text ?? '';
    return { text, chunks: [{ t: endT, c: text.length }], chunkMode: 'none', gates };
  }
  if (output.mode === 'cumulative') {
    let previous = '';
    const chunks: Array<{ t: number; c: number }> = [];
    let text = '';
    for (const chunk of raw) {
      if (chunk.text.startsWith(previous)) {
        const delta = chunk.text.slice(previous.length);
        if (delta.length > 0) chunks.push({ t: chunk.t, c: delta.length });
        text = chunk.text;
      } else {
        if (!gates.includes('cumulative-not-prefix')) gates.push('cumulative-not-prefix');
        chunks.push({ t: chunk.t, c: chunk.text.length });
        text += chunk.text;
      }
      previous = chunk.text;
    }
    return { text, chunks, chunkMode: 'cumulative-converted', gates };
  }
  const chunks = raw.filter((c) => c.text.length > 0).map((c) => ({ t: c.t, c: c.text.length }));
  const text = raw.map((c) => c.text).join('');
  if (output.text !== undefined && output.text !== text) gates.push('stream-text-mismatch');
  return { text, chunks, chunkMode: 'delta', gates };
}

/**
 * Run one task session and return its run file (`BenchRunResult` with
 * `harness.control.kind: 'chrome-ai-tasks'`, digest included).
 *
 * Order of work: trace (visibility, focus, compute pressure), environment
 * capture, fingerprint, the host's preflight (a failure records a
 * `preflight` event and throws `TaskPreflightError`: no result, nothing to
 * export), then each cell in `systemOrder`: `availability()` before, the
 * host's `beforeLoad`, the timed load (`create()` or the pipeline load, with
 * its download capture), then the items in list order, one per call, each
 * stamped at request, at every chunk and at the end; a failed or timed-out
 * item is recorded as that item's error (`item-error` event) and the next
 * item runs; nothing is retried. Between systems the session waits up to
 * `pressureGateMs` for compute pressure to settle. After the last item it
 * awaits `finalize` and writes the captures into
 * `harness.control.tasks.driver` (the end readings) and the cells' download
 * records, then computes the client summaries and the digest.
 *
 * @param options - See `TaskSessionOptions`.
 * @returns The run, digest set.
 * @throws {TypeError} When the control marker is not a valid `chrome-ai-tasks` marker, a cell's arm is
 *   not in `systemOrder`, an arm has no cell, or an arm has no adapter.
 * @throws {TaskPreflightError} When the preflight fails.
 * @example
 * const run = await runTaskSession({ harness, cells, adapters, preflight, finalize });
 */
export async function runTaskSession(options: TaskSessionOptions): Promise<BenchRunResult> {
  const { harness, hooks, abortSignal } = options;
  const control = harness.control;
  if (!control || control.kind !== 'chrome-ai-tasks') {
    throw new TypeError("runTaskSession needs harness.control from createHarnessControl('chrome-ai-tasks', { tasks })");
  }
  const controlError = controlTasksError(control);
  if (controlError) throw new TypeError(controlError);
  const tasks = control.tasks as TaskSessionRecord;
  const order = tasks.systemOrder;
  for (const cell of options.cells) {
    const arm = taskArmId(cell.model.runtimeId, cell.model.benchModelId);
    if (!order.includes(arm)) throw new TypeError(`cell ${arm}/${cell.workloadId}: arm not in harness.control.tasks.systemOrder`);
    if (!options.adapters.has(arm)) throw new TypeError(`no adapter for arm ${arm}`);
  }
  const armOf = (cell: TaskPlannedCell) => taskArmId(cell.model.runtimeId, cell.model.benchModelId);
  const planned = order.flatMap((arm) => options.cells.filter((cell) => armOf(cell) === arm));
  for (const arm of order) {
    if (!planned.some((cell) => armOf(cell) === arm)) throw new TypeError(`arm ${arm} of systemOrder has no cell`);
  }

  const watchdog = { ...TASK_ITEM_WATCHDOG_MS, ...options.watchdogMs };
  const trace = options.trace ?? new TraceRecorder({ trackFocus: true });
  const memApi = memoryApiAvailable();
  const memoryTimeout = options.memorySampleTimeoutMs ?? 5_000;
  const sample = async () => (memApi !== 'none' ? await sampleMemoryBytes(memoryTimeout) : null);
  await trace.attach();
  trace.record('suite-start', `chrome-ai-tasks ${tasks.task} ${tasks.subset}`);
  try {
    hooks?.onPhase?.('environment');
    const environment = await captureEnvironment();
    hooks?.onEnvironment?.(environment);
    hooks?.onPhase?.('fingerprint');
    if (abortSignal?.aborted) throw abortError();
    const fingerprint = options.skipFingerprint ? null : await runFingerprint();

    hooks?.onPhase?.('preflight');
    if (options.preflight) {
      const verdict = await options.preflight();
      trace.record('preflight', verdict.ok ? `ok: ${verdict.detail}`.slice(0, 2000) : `failed: ${verdict.detail}`.slice(0, 2000));
      if (!verdict.ok) throw new TaskPreflightError(verdict.detail);
    }

    hooks?.onPhase?.('cells');
    const baseline = await sample();
    const cells: BenchCellResult[] = [];
    let previousArm: string | undefined;
    for (let ci = 0; ci < planned.length; ci++) {
      if (abortSignal?.aborted) throw abortError();
      const plan = planned[ci];
      const arm = armOf(plan);
      if (previousArm !== undefined && arm !== previousArm) {
        trace.record('cooldown-start', 'pressure-gate');
        await waitForPressure(trace, options.pressureGateMs ?? TASK_PRESSURE_GATE_MS, abortSignal);
        trace.record('cooldown-end');
      }
      previousArm = arm;
      hooks?.onCellStart?.(plan, ci, planned.length);
      const adapter = options.adapters.get(arm)!;
      const cellId = `${arm}/${plan.workloadId}`;
      const task: TaskCellRecord = { api: 'unknown' };
      const cell: BenchCellResult = {
        cellId,
        runtimeId: plan.model.runtimeId,
        model: plan.model,
        workloadId: plan.workloadId,
        workloadKind: tasks.task,
        resolvedBackend: 'unknown',
        load: null,
        iterations: [],
        status: 'ok',
        task,
      };
      if (memApi !== 'none') cell.memory = { api: memApi, ...(baseline !== null ? { baseline } : {}) };
      try {
        const before = await adapter.availability?.(plan);
        if (before !== undefined) task.availabilityBefore = before;
      } catch (error) {
        task.availabilityBefore = `error:${describeError(error).name}`.slice(0, 32);
      }
      await options.beforeLoad?.(plan);

      const progress: Array<{ t: number; pct: number }> = [];
      const loadController = new AbortController();
      const onAbort = () => loadController.abort();
      abortSignal?.addEventListener('abort', onAbort);
      const loadStart = hrNow();
      let loaded: LoadedTaskSystem;
      try {
        loaded = await withDeadline(
          adapter.load(plan, {
            abortSignal: loadController.signal,
            onProgress: (pct) => {
              if (typeof pct === 'number' && Number.isFinite(pct)) progress.push({ t: hrNow(), pct });
            },
          }),
          options.loadTimeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS,
          loadController,
          `loading ${cellId}`,
        );
      } catch (error) {
        abortSignal?.removeEventListener('abort', onAbort);
        if (abortSignal?.aborted) throw abortError();
        const load: LoadRecord = { cached: undefined, startT: loadStart, endT: hrNow() };
        if (progress.length > 0) load.progress = decimate(progress, 50);
        cell.load = load;
        cell.status = 'error';
        const described = describeError(error);
        cell.error = { name: described.name, message: described.message, ...(described.cause ? { cause: described.cause } : {}) };
        if (cell.memory) {
          const atError = await sample();
          if (atError !== null) cell.memory.atError = atError;
        }
        cells.push(cell);
        hooks?.onCellFinish?.(cell);
        continue;
      }
      abortSignal?.removeEventListener('abort', onAbort);
      const load: LoadRecord = loaded.loadSpan
        ? { cached: loaded.cached, startT: loaded.loadSpan.startT, endT: loaded.loadSpan.endT }
        : { cached: loaded.cached, startT: loadStart, endT: hrNow() };
      if (progress.length > 0) load.progress = decimate(progress, 50);
      cell.load = load;
      cell.resolvedBackend = loaded.resolvedBackend;
      if (loaded.runtimeVersion !== undefined) cell.runtimeVersion = loaded.runtimeVersion;
      if (loaded.runtimeConfig) cell.runtimeConfig = { ...loaded.runtimeConfig };
      task.api = loaded.api;
      if (loaded.availabilityAtCreate !== undefined) task.availabilityAtCreate = loaded.availabilityAtCreate;
      if (loaded.inputQuota !== undefined) task.inputQuota = loaded.inputQuota;
      if (loaded.download) task.download = { events: loaded.download.events.slice(0, 10_000), wallMs: loaded.download.wallMs };
      if (loaded.verify) {
        try {
          const extra = await loaded.verify();
          if (extra) cell.runtimeConfig = { ...cell.runtimeConfig, ...extra };
        } catch (error) {
          const described = describeError(error);
          cell.status = 'error';
          cell.error = { name: described.name, message: described.message, ...(described.cause ? { cause: described.cause } : {}) };
          await loaded.dispose().catch(() => undefined);
          cells.push(cell);
          hooks?.onCellFinish?.(cell);
          continue;
        }
      }
      if (cell.memory) {
        const postLoad = await sample();
        if (postLoad !== null) cell.memory.postLoad = postLoad;
      }

      const iterations: TaskIteration[] = [];
      for (let j = 0; j < plan.items.length; j++) {
        if (abortSignal?.aborted) {
          await loaded.dispose().catch(() => undefined);
          throw abortError();
        }
        const item = plan.items[j];
        const controller = new AbortController();
        const forward = () => controller.abort();
        abortSignal?.addEventListener('abort', forward);
        let inputUsage: TaskIteration['inputUsage'];
        try {
          inputUsage = await loaded.measureInputUsage?.(item, controller.signal);
        } catch {
          inputUsage = undefined;
        }
        const raw: Array<{ text: string; t: number }> = [];
        const startT = hrNow();
        let output: TaskItemOutput | undefined;
        let failure: ReturnType<typeof describeError> | undefined;
        try {
          output = await withDeadline(
            loaded.runItem(item, { abortSignal: controller.signal, onChunk: (text, t) => raw.push({ text, t }) }),
            watchdog[tasks.task],
            controller,
            `item ${item.id}`,
          );
        } catch (error) {
          if (abortSignal?.aborted) {
            abortSignal.removeEventListener('abort', forward);
            await loaded.dispose().catch(() => undefined);
            throw abortError();
          }
          failure = describeError(error);
        }
        const endT = hrNow();
        abortSignal?.removeEventListener('abort', forward);
        let iteration: TaskIteration;
        const common = {
          itemId: item.id,
          index: j,
          startT,
          endT,
          inputChars: item.text.length,
          sourceSha256: item.sha256,
          ...(tasks.task === 'translate' ? { source: item.text } : {}),
        };
        if (failure || !output) {
          const err = failure ?? { name: 'Error', message: 'the system returned no output' };
          iteration = {
            ...common,
            chunks: [{ t: endT, c: 0 }],
            chunkMode: 'none',
            text: '',
            outputSha256: await sha256Hex(''),
            gates: [],
            error: err,
            ...(inputUsage ? { inputUsage } : {}),
          };
          trace.record('item-error', `${cellId} ${item.id}: ${err.name}`.slice(0, 500));
        } else {
          const built = buildTrace(output, raw, endT);
          const usage = inputUsage ?? output.inputUsage;
          iteration = {
            ...common,
            chunks: built.chunks,
            chunkMode: built.chunkMode,
            text: built.text,
            outputSha256: await sha256Hex(built.text),
            gates: built.gates,
            ...(usage ? { inputUsage: usage } : {}),
            ...(output.detect ? { detect: output.detect.slice(0, TASK_DETECT_MAX_CANDIDATES) } : {}),
            ...(output.targetToken ? { targetToken: output.targetToken } : {}),
            ...(output.truncation === null
              ? { inputTruncated: null, inputTokens: null, modelMaxTokens: null }
              : output.truncation
                ? { ...output.truncation }
                : {}),
          };
        }
        iterations.push(iteration);
        hooks?.onItem?.(cellId, iteration);
      }
      cell.iterations = iterations;
      try {
        const after = await loaded.availability?.();
        if (after !== undefined) task.availabilityAfter = after;
      } catch (error) {
        task.availabilityAfter = `error:${describeError(error).name}`.slice(0, 32);
      }
      if (cell.memory) {
        const postRun = await sample();
        if (postRun !== null) cell.memory.postRun = postRun;
      }
      await loaded.dispose().catch(() => undefined);
      cells.push(cell);
      hooks?.onCellFinish?.(cell);
    }

    trace.record('suite-end');
    const createdAt = new Date().toISOString();
    hooks?.onPhase?.('finalize');
    const captures = options.finalize ? await options.finalize() : undefined;
    const finalTasks: TaskSessionRecord = JSON.parse(JSON.stringify(tasks)) as TaskSessionRecord;
    if (captures && finalTasks.driver) {
      const d = finalTasks.driver;
      if (captures.components) d.components.end = captures.components;
      if (captures.onDeviceInternals) d.onDeviceInternals.end = captures.onDeviceInternals;
      if (captures.freeDiskBytes !== undefined) d.freeDiskBytes.end = captures.freeDiskBytes;
      if (captures.profileFolderBytes) d.profileFolderBytes.end = captures.profileFolderBytes;
    }
    for (const [cellId, delta] of Object.entries(captures?.profileBytesDeltaByCell ?? {})) {
      const target = cells.find((c) => c.cellId === cellId);
      if (target?.task?.download) target.task.download.profileBytesDelta = Math.round(delta);
    }
    const result: BenchRunResult = {
      protocol: BENCH_PROTOCOL_VERSION,
      schemaVersion: BENCH_SCHEMA_VERSION,
      runId: generateRunId(),
      createdAt,
      harness: { ...harness, control: { ...control, tasks: finalTasks } },
      suite: 'custom',
      environment,
      fingerprint,
      cells,
      events: [...trace.all],
    };
    result.clientSummaries = summarizeRun(result);
    result.digest = await computeRunDigest(result);
    return result;
  } finally {
    await trace.dispose();
  }
}
