/**
 * ONNX Runtime Web operator profiles for the `ort-profile` control kind.
 *
 * With `enableProfiling` set on a session, ONNX Runtime Web records every
 * kernel event in the WASM heap and prints them, as Chrome-trace JSON one
 * event per line, through the WASM module's stdout (`console.log`) inside
 * `session.endProfiling()`, synchronously; nothing is printed while the model
 * runs. The module binds `console.log` when it initialises, so
 * `installOrtProfileConsole()` must run before the runtime loads in that
 * context (page or worker); `endProfilingInto()` then routes the printed
 * lines into an accumulator instead of the console.
 *
 * Because every event stays in the WASM heap until the session ends,
 * profiling a cell's timed iterations exhausts the WASM lane's heap
 * (`std::bad_alloc` after a few hundred runs) and holds gigabytes on the
 * WebGPU lane. The profile therefore comes from a pass of its own after the
 * cell (`runOrtProfilePass`): a fresh profiled session runs a short warmup
 * request and then one request with the cell's prompt.
 *
 * The accumulator attributes events to runs: the pass wraps `session.run`
 * and records the owner of every call in order (null for the warmup). ONNX
 * Runtime prints each run's `Node` events (one per kernel; `dur` is the
 * host-side kernel time, which on the WebGPU provider is dispatch, not GPU
 * time) before the run's `model_run` event, so the k-th `model_run` closes
 * the k-th call. On the WebGPU provider the GPU timestamps arrive as `Api`
 * events after every run, in run order; they are split into runs at the
 * largest timestamp gaps (one fewer cut than runs), the gap between two runs
 * being the host's sampling and dispatch.
 */

import { PROFILE_MAX_OPERATOR_ROWS, type OrtOperatorProfile, type OrtOperatorRow } from '@localmode/bench';

/** What one session run was made for: the profiled cell and the phase, or null for the warmup. */
export type OrtRunOwner = { cellId: string; phase: 'prefill' | 'decode' } | null;

/** A parsed profiler event (the fields this module reads). */
interface OrtEvent {
  cat?: string;
  name?: string;
  ts?: number;
  dur?: number;
  args?: { op_name?: unknown; provider?: unknown };
}

/** Per-cell running totals. */
interface CellTotals {
  modelRunUs: number;
  recordedRuns: number;
  nodeEvents: number;
  rows: Map<string, OrtOperatorRow & { us: number }>;
}

/** A GPU (`Api`) event kept until the runs are known. */
interface GpuEvent {
  ts: number;
  dur: number;
  opType: string;
  kernel: string;
  line?: string;
}

/** The accumulator's result for one session. */
export interface OrtSessionAggregate {
  /** Rows and totals per profiled cell. */
  cells: Map<string, { modelRunUs: number; recordedRuns: number; nodeEvents: number; rows: OrtOperatorRow[] }>;
  /** `model_run` events the profile held. */
  recordedRuns: number;
  /** Event lines read. */
  events: number;
  /** The kept raw event lines (owned runs and the session's own events), when `keepRaw` was set. */
  raw?: string[];
}

/** Op type and kernel of a `Node` event: `args.op_name`, and the node name's last segment without `_kernel_time` and a trailing `_<n>`. */
function nodeKernel(event: OrtEvent): { opType: string; kernel: string } {
  const opType = typeof event.args?.op_name === 'string' ? event.args.op_name : 'unknown';
  const name = typeof event.name === 'string' ? event.name : '';
  const last = name.replace(/_kernel_time$/, '').split('/').pop() ?? '';
  const kernel = last.replace(/_\d+$/, '') || opType;
  return { opType, kernel };
}

/** Op type and program of a WebGPU `Api` event: its name is `<node>&<opType>&<program>`. */
function gpuKernel(event: OrtEvent): { opType: string; kernel: string } {
  const parts = (typeof event.name === 'string' ? event.name : '').split('&');
  const opType = parts[1] || 'unknown';
  return { opType, kernel: parts[2] || opType };
}

function clip(text: string): string {
  return text.length > 200 ? text.slice(0, 200) : text;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/**
 * Split the GPU events into `runs` consecutive groups at the `runs - 1`
 * largest timestamp gaps (absolute, so a backwards jump between two runs
 * counts as a gap too).
 *
 * @param timestamps - The `Api` events' `ts`, in print order.
 * @param runs - The session's run count.
 * @returns The run index of every event, or null when there are fewer events than runs.
 */
export function splitGpuEventsIntoRuns(timestamps: readonly number[], runs: number): number[] | null {
  if (runs <= 0 || timestamps.length < runs) return null;
  if (runs === 1) return timestamps.map(() => 0);
  const gaps = timestamps.slice(1).map((t, i) => ({ at: i + 1, size: Math.abs(t - timestamps[i]) }));
  const cuts = new Set(
    [...gaps]
      .sort((a, b) => b.size - a.size || a.at - b.at)
      .slice(0, runs - 1)
      .map((g) => g.at),
  );
  const index: number[] = [];
  let run = 0;
  for (let i = 0; i < timestamps.length; i++) {
    if (cuts.has(i)) run++;
    index.push(run);
  }
  return index;
}

/**
 * Fold aggregate rows into the bounded list a run file carries: largest
 * total first, at most `PROFILE_MAX_OPERATOR_ROWS` rows, the rest summed into
 * one `(other)` row per phase and timing source.
 *
 * @param rows - Every aggregate row.
 * @returns The bounded rows, and how many were folded.
 */
export function boundOperatorRows(rows: OrtOperatorRow[]): { operators: OrtOperatorRow[]; foldedRows?: number } {
  const sorted = [...rows].sort(
    (a, b) =>
      b.totalMs - a.totalMs ||
      a.phase.localeCompare(b.phase) ||
      a.timing.localeCompare(b.timing) ||
      a.opType.localeCompare(b.opType) ||
      a.kernel.localeCompare(b.kernel),
  );
  if (sorted.length <= PROFILE_MAX_OPERATOR_ROWS) return { operators: sorted };
  const kept = sorted.slice(0, PROFILE_MAX_OPERATOR_ROWS);
  const rest = sorted.slice(PROFILE_MAX_OPERATOR_ROWS);
  const others: OrtOperatorRow[] = [];
  for (const phase of ['prefill', 'decode'] as const) {
    for (const timing of ['node', 'gpu'] as const) {
      const part = rest.filter((r) => r.phase === phase && r.timing === timing);
      if (part.length === 0) continue;
      others.push({
        phase,
        timing,
        opType: '(other)',
        kernel: '(other)',
        provider: '(various)',
        totalMs: round3(part.reduce((a, r) => a + r.totalMs, 0)),
        count: part.reduce((a, r) => a + r.count, 0),
      });
    }
  }
  return { operators: [...kept, ...others], foldedRows: rest.length };
}

/**
 * An accumulator for the lines one session prints from `endProfiling()`.
 *
 * @param owners - The owner of every session run, in call order.
 * @param options - `keepRaw` to keep the owned runs' raw lines and the session's own events.
 * @returns `line()` to feed each printed line, `finish()` for the aggregate.
 */
export function createOrtProfileAccumulator(owners: readonly OrtRunOwner[], options: { keepRaw?: boolean } = {}) {
  const totals = new Map<string, CellTotals>();
  const gpu: GpuEvent[] = [];
  const raw: string[] = [];
  let runIndex = 0;
  let events = 0;
  let pending: string[] = [];

  const cellTotals = (cellId: string): CellTotals => {
    let t = totals.get(cellId);
    if (!t) {
      t = { modelRunUs: 0, recordedRuns: 0, nodeEvents: 0, rows: new Map() };
      totals.set(cellId, t);
    }
    return t;
  };
  const addRow = (owner: NonNullable<OrtRunOwner>, timing: 'node' | 'gpu', provider: string, opType: string, kernel: string, durUs: number) => {
    const t = cellTotals(owner.cellId);
    const key = [owner.phase, timing, provider, opType, kernel].join('\u0000');
    let row = t.rows.get(key);
    if (!row) {
      row = { phase: owner.phase, timing, opType: clip(opType), kernel: clip(kernel), provider: clip(provider), totalMs: 0, count: 0, us: 0 };
      t.rows.set(key, row);
    }
    row.us += durUs;
    row.count++;
  };

  return {
    /** Feed one line ONNX Runtime printed. */
    line(text: unknown): void {
      if (typeof text !== 'string') return;
      const trimmed = text.trim().replace(/,$/, '');
      if (trimmed === '' || trimmed === '[' || trimmed === ']') return;
      let event: OrtEvent;
      try {
        event = JSON.parse(trimmed) as OrtEvent;
      } catch {
        return;
      }
      events++;
      const dur = typeof event.dur === 'number' && Number.isFinite(event.dur) ? Math.max(0, event.dur) : 0;
      const owner = owners[runIndex] ?? null;
      if (event.cat === 'Node') {
        if (owner) {
          const { opType, kernel } = nodeKernel(event);
          const provider = typeof event.args?.provider === 'string' ? event.args.provider : 'unknown';
          addRow(owner, 'node', provider, opType, kernel, dur);
          cellTotals(owner.cellId).nodeEvents++;
          if (options.keepRaw) pending.push(trimmed);
        }
        return;
      }
      if (event.cat === 'Api') {
        const { opType, kernel } = gpuKernel(event);
        gpu.push({ ts: typeof event.ts === 'number' ? event.ts : 0, dur, opType, kernel, ...(options.keepRaw ? { line: trimmed } : {}) });
        return;
      }
      if (event.name === 'model_run') {
        if (owner) {
          const t = cellTotals(owner.cellId);
          t.modelRunUs += dur;
          t.recordedRuns++;
          if (options.keepRaw) raw.push(...pending, trimmed);
        }
        pending = [];
        runIndex++;
        return;
      }
      if (event.name === 'SequentialExecutor::Execute') {
        if (owner && options.keepRaw) pending.push(trimmed);
        return;
      }
      if (options.keepRaw && event.cat === 'Session') raw.push(trimmed);
    },

    /** Attribute the GPU events and return the aggregate. */
    finish(): OrtSessionAggregate {
      const runOf = splitGpuEventsIntoRuns(gpu.map((g) => g.ts), runIndex);
      if (runOf) {
        gpu.forEach((g, i) => {
          const owner = owners[runOf[i]] ?? null;
          if (!owner) return;
          addRow(owner, 'gpu', 'WebGpuExecutionProvider', g.opType, g.kernel, g.dur);
          if (options.keepRaw && g.line) raw.push(g.line);
        });
      }
      const cells: OrtSessionAggregate['cells'] = new Map();
      for (const [cellId, t] of totals) {
        cells.set(cellId, {
          modelRunUs: t.modelRunUs,
          recordedRuns: t.recordedRuns,
          nodeEvents: t.nodeEvents,
          rows: [...t.rows.values()].map(({ us, ...row }) => ({ ...row, totalMs: us / 1000 })),
        });
      }
      return { cells, recordedRuns: runIndex, events, ...(options.keepRaw ? { raw } : {}) };
    },
  };
}

/**
 * Combine the per-session aggregates of one profiling pass into the cell's
 * profile.
 *
 * @param cellId - The profiled cell.
 * @param aggregates - One aggregate per session the model has.
 * @param madeRuns - The session runs the profiled request made (all sessions).
 * @param pass - The pass's warmup and token budget.
 * @returns The `ort-operators` profile.
 */
export function cellOrtProfile(
  cellId: string,
  aggregates: OrtSessionAggregate[],
  madeRuns: number,
  pass: OrtOperatorProfile['pass'],
): OrtOperatorProfile {
  const merged = new Map<string, OrtOperatorRow>();
  let modelRunUs = 0;
  let recordedRuns = 0;
  let nodeEvents = 0;
  for (const agg of aggregates) {
    const cell = agg.cells.get(cellId);
    if (!cell) continue;
    modelRunUs += cell.modelRunUs;
    recordedRuns += cell.recordedRuns;
    nodeEvents += cell.nodeEvents;
    for (const row of cell.rows) {
      const key = [row.phase, row.timing, row.provider, row.opType, row.kernel].join('\u0000');
      const prev = merged.get(key);
      merged.set(key, prev ? { ...prev, totalMs: prev.totalMs + row.totalMs, count: prev.count + row.count } : { ...row });
    }
  }
  const rows = [...merged.values()].map((r) => ({ ...r, totalMs: round3(r.totalMs) }));
  const gpuRows = rows.filter((r) => r.timing === 'gpu');
  return {
    kind: 'ort-operators',
    pass: { ...pass },
    runs: madeRuns,
    modelRunMs: round3(modelRunUs / 1000),
    nodeEvents,
    nodeMs: round3(rows.filter((r) => r.timing === 'node').reduce((a, r) => a + r.totalMs, 0)),
    ...(gpuRows.length > 0 ? { gpuMs: round3(gpuRows.reduce((a, r) => a + r.totalMs, 0)) } : {}),
    ...boundOperatorRows(rows),
    ...(recordedRuns < madeRuns ? { truncated: true as const } : {}),
  };
}

type LineSink = (line: unknown) => void;
let sink: LineSink | null = null;
let installed = false;

/**
 * Route this context's `console.log` through a switch, so that the lines
 * ONNX Runtime prints from `endProfiling()` can be captured. Install it
 * before the runtime first loads in this context (the WASM module binds the
 * console when it initialises); idempotent. Outside a capture every call
 * reaches the console unchanged.
 */
export function installOrtProfileConsole(): void {
  if (installed) return;
  installed = true;
  const original = console.log.bind(console);
  console.log = (...args: unknown[]) => {
    if (sink && args.length === 1) sink(args[0]);
    else original(...args);
  };
}

/**
 * End profiling on a session, feeding every line it prints into `onLine`.
 *
 * @param session - An ONNX Runtime session created with `enableProfiling`.
 * @param onLine - Receives each printed line.
 * @returns The number of lines captured.
 * @throws {Error} When the session has no `endProfiling()`.
 */
export function endProfilingInto(session: { endProfiling?: () => unknown }, onLine: LineSink): number {
  if (typeof session.endProfiling !== 'function') throw new Error('this ONNX Runtime session has no endProfiling()');
  let lines = 0;
  sink = (line) => {
    lines++;
    onLine(line);
  };
  try {
    session.endProfiling();
  } finally {
    sink = null;
  }
  return lines;
}

/** The structural model a profiling pass drives (the Transformers.js provider's language model). */
export interface ProfilableModel {
  preload(): Promise<void>;
  getInferenceSessions(): Record<string, { run?: (...args: unknown[]) => unknown; endProfiling?: () => unknown }>;
  doGenerate(options: { prompt: string; systemPrompt?: string; maxTokens?: number; temperature?: number }): Promise<unknown>;
  unload?(): Promise<void>;
}

/** Options of `runOrtProfilePass`. */
export interface OrtProfilePassOptions {
  cellId: string;
  /** Creates the model with `sessionOptions: { enableProfiling: true }`; called once per pass. */
  createModel(): ProfilableModel;
  /** The cell's request (prompt, system prompt, temperature, token budget). */
  request: { prompt: string; systemPrompt?: string; temperature?: number; maxTokens: number };
  /** New tokens of the warmup request that precedes the profiled one. */
  warmupTokens: number;
  /** Keep the raw events for the downloadable profile. */
  keepRaw?: boolean;
}

/** Result of a profiling pass. */
export interface OrtProfilePassResult {
  profile: OrtOperatorProfile;
  /** Raw Chrome-trace JSON (an array of the kept events), when `keepRaw` was set. */
  rawJson?: string;
}

/**
 * Run one profiling pass: load a fresh profiled session, run the warmup
 * request, then the cell's request, end profiling, aggregate, unload.
 *
 * @param options - See `OrtProfilePassOptions`.
 * @returns The cell's profile (and the raw events when asked).
 * @throws {Error} When the session printed no profile (the console was bound before `installOrtProfileConsole`), or a step fails.
 */
export async function runOrtProfilePass(options: OrtProfilePassOptions): Promise<OrtProfilePassResult> {
  installOrtProfileConsole();
  const model = options.createModel();
  try {
    await model.preload();
    const sessions = Object.entries(model.getInferenceSessions());
    if (sessions.length === 0) throw new Error('the profiled model exposes no ONNX Runtime session');
    let owner: 'warmup' | 'profiled' = 'warmup';
    let runsInRequest = 0;
    const owners = new Map<string, OrtRunOwner[]>(sessions.map(([name]) => [name, []]));
    for (const [name, session] of sessions) {
      const original = session.run;
      if (typeof original !== 'function') throw new Error(`ONNX Runtime session ${name} has no run()`);
      const list = owners.get(name)!;
      session.run = function (this: unknown, ...args: unknown[]) {
        list.push(owner === 'profiled' ? { cellId: options.cellId, phase: runsInRequest === 0 ? 'prefill' : 'decode' } : null);
        if (owner === 'profiled') runsInRequest++;
        return original.apply(this, args);
      };
    }
    const { prompt, systemPrompt, temperature } = options.request;
    await model.doGenerate({ prompt, systemPrompt, temperature, maxTokens: options.warmupTokens });
    owner = 'profiled';
    await model.doGenerate({ prompt, systemPrompt, temperature, maxTokens: options.request.maxTokens });
    const aggregates: OrtSessionAggregate[] = [];
    for (const [name, session] of sessions) {
      const accumulator = createOrtProfileAccumulator(owners.get(name)!, { keepRaw: options.keepRaw });
      const lines = endProfilingInto(session, (line) => accumulator.line(line));
      if (lines === 0) {
        throw new Error(
          `ONNX Runtime printed no profile for session ${name}; the runtime bound the console before the profile capture was installed`,
        );
      }
      aggregates.push(accumulator.finish());
    }
    const profile = cellOrtProfile(options.cellId, aggregates, runsInRequest, {
      warmupTokens: options.warmupTokens,
      maxTokens: options.request.maxTokens,
    });
    const rawJson = options.keepRaw ? `[\n${aggregates.flatMap((a) => a.raw ?? []).join(',\n')}\n]\n` : undefined;
    return { profile, ...(rawJson !== undefined ? { rawJson } : {}) };
  } finally {
    await model.unload?.().catch(() => undefined);
  }
}

/**
 * gzip a text with the platform's CompressionStream.
 *
 * @param text - The text.
 * @returns The compressed bytes.
 */
export async function gzipText(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
