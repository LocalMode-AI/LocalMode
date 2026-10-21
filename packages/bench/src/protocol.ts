/**
 * Protocol constants: fixed public workloads and the run policy. These are
 * part of the versioned benchmark spec — any change to prompts, token budgets,
 * or policy numbers requires a protocol version bump (see BENCH_PROTOCOL_VERSION).
 *
 * Metric naming follows llama-bench conventions (ppN = prefill on an
 * N-token prompt, tgN = token generation over N tokens) and MLPerf Client
 * definitions (TTFT; decode rate excludes the first token).
 */

import type {
  BenchRuntimeId,
  ControlKind,
  EmbedWorkloadSpec,
  HarnessControl,
  HarnessControlWasmLane,
  LLMWorkloadSpec,
  QualityWorkloadSpec,
} from './types.js';

/**
 * ~128-token prompt (509 characters). Original text, public domain.
 * Exact per-tokenizer counts are computed post-hoc from this fixed string.
 */
const PROMPT_PP128 = [
  'You are helping a small public library plan its move to a new building across town.',
  'The collection holds forty thousand books, two thousand audio recordings, and a local',
  'history archive that must stay in labeled order. Volunteers are available on weekends',
  'only, and the budget covers one rental truck. Describe a practical week-by-week moving',
  'plan that keeps the library partially open, protects the archive, and finishes within',
  'eight weeks. Be specific about labeling, sequencing, and volunteer coordination.',
].join(' ');

/** ~512-token prompt (2,335 characters). Original text, public domain. */
const PROMPT_PP512 = [
  'Read the following notes from a town planning meeting and then answer the question at the end.',
  'The town of Milbrook has grown from eight thousand residents to eleven thousand in six years.',
  'The old water treatment plant, built fifty years ago, operates at ninety two percent of its',
  'rated capacity during summer months. An engineering survey found that the intake pipes show',
  'corrosion consistent with their age but no immediate risk of failure. Replacing the plant',
  'entirely would cost an estimated thirty one million dollars and take four years, during which',
  'a temporary treatment module would be rented at two hundred thousand dollars per month.',
  'Upgrading the existing plant in three phases would cost nineteen million dollars, take six',
  'years, and raise capacity by forty percent, but phase two requires shutting one of the three',
  'treatment trains for nine months. The town engineer favors the upgrade because the town can',
  'fund it from reserves plus a small bond, avoiding a rate increase larger than four percent.',
  'The finance director notes that construction costs have risen eleven percent in two years and',
  'argues that delaying the full replacement will only make it more expensive, and that a larger',
  'bond issued now at current rates would cost less over thirty years than a later one. Several',
  'residents raised concerns about summer watering restrictions during phase two, and a local',
  'manufacturer that employs three hundred people said an unreliable water supply would force it',
  'to install its own storage tanks at significant cost. The mayor asked both officials to prepare',
  'a comparison covering total cost of ownership over thirty years, resilience during construction,',
  'capacity margins in the final state, and the effect on household water rates under three growth',
  'scenarios: flat, moderate, and rapid. The engineer also mentioned that federal infrastructure',
  'grants covering up to twenty percent of qualifying water projects open for applications next',
  'spring, though awards are competitive and would delay the start by at least eight months either way.',
  'Question: Write a balanced recommendation memo to the town council. Weigh both options against',
  'the four criteria the mayor listed, account for the grant opportunity, and end with a clear',
  'recommendation and two conditions under which the council should switch to the other option.',
].join(' ');

/** Fixed generation budget for timed lanes (tg128, MLPerf-Client-sized). */
export const GENERATION_BUDGET = 128;

/**
 * Minimum generated characters for a timed iteration to count as a decode
 * measurement (part of the versioned protocol). An instruct model that emits
 * EOS after a handful of characters - typically an untemplated prompt or a
 * tokenizer mismatch - produces no decode phase to time; such iterations are
 * gated `degenerate-output` and the cell is marked invalid rather than scored.
 */
export const MIN_GENERATED_CHARS = 16;

/** LLM performance workloads. */
export const LLM_WORKLOADS: readonly LLMWorkloadSpec[] = [
  {
    id: 'chat-pp128-tg128',
    kind: 'llm-generate',
    label: 'Chat pp128/tg128',
    prompt: PROMPT_PP128,
    approxPromptTokens: 128,
    maxTokens: GENERATION_BUDGET,
    temperature: 0,
  },
  {
    id: 'chat-pp512-tg128',
    kind: 'llm-generate',
    label: 'Long-context pp512/tg128',
    prompt: PROMPT_PP512,
    approxPromptTokens: 512,
    maxTokens: GENERATION_BUDGET,
    temperature: 0,
  },
] as const;

/** Deterministic embedding corpus: 32 fixed ~200-char sentences. */
function embedTexts(): string[] {
  const topics = [
    'the maintenance schedule for a fleet of electric delivery vans in a coastal city',
    'a beginner guide to fermenting vegetables safely at home in small batches',
    'the migration patterns of shorebirds along the Atlantic flyway in autumn',
    'how a public library catalogs and preserves regional oral history recordings',
    'the tradeoffs between timber framing and steel framing for small workshops',
    'a training plan that prepares a new runner for a half marathon in twenty weeks',
    'the way tide pools support diverse life despite extreme daily changes',
    'budgeting practices for a volunteer-run community theater production',
  ];
  const texts: string[] = [];
  for (let i = 0; i < 32; i++) {
    const topic = topics[i % topics.length];
    texts.push(
      `Document ${i + 1}: This passage explains ${topic}. It covers the key steps, ` +
        `common mistakes, expected costs, and a short checklist that a careful reader ` +
        `can apply immediately, with concrete numbers where they matter.`,
    );
  }
  return texts;
}

const EMBED_TEXTS = embedTexts();

/** Embedding performance workloads. */
export const EMBED_WORKLOADS: readonly EmbedWorkloadSpec[] = [
  {
    id: 'embed-single',
    kind: 'embed-single',
    label: 'Embedding single-query latency',
    texts: [EMBED_TEXTS[0]],
  },
  {
    id: 'embed-batch32',
    kind: 'embed-batch',
    label: 'Embedding batch-32 throughput',
    texts: EMBED_TEXTS,
  },
] as const;

/** Quality-fidelity workloads (separate lane, temperature 0). */
export const QUALITY_WORKLOADS: readonly QualityWorkloadSpec[] = [
  { id: 'quality-mmlu-25', kind: 'quality-mmlu', label: 'tinyMMLU fidelity (25 items)', items: 25 },
  { id: 'quality-mmlu-100', kind: 'quality-mmlu', label: 'tinyMMLU fidelity (100 items)', items: 100 },
  { id: 'quality-sts-100', kind: 'quality-sts', label: 'STS-B Spearman (100 pairs)', items: 100 },
] as const;

/** All workloads indexed by id. */
export const WORKLOADS_BY_ID: ReadonlyMap<
  string,
  LLMWorkloadSpec | EmbedWorkloadSpec | QualityWorkloadSpec
> = new Map(
  [...LLM_WORKLOADS, ...EMBED_WORKLOADS, ...QUALITY_WORKLOADS].map((w) => [w.id, w]),
);

/**
 * Fixed runtime execution order (part of the versioned protocol). This makes
 * the order deterministic so runtime interleaving is not a confounder across
 * runs; it is a reproducibility measure, not a correctness fix. The order runs
 * the WASM-arena runtimes first and the multi-GB-heap runtimes last; within a
 * runtime, catalog order is preserved.
 *
 * The Transformers.js WASM lane runs before its WebGPU lane: Transformers.js
 * serializes every ONNX session creation on one promise chain and never
 * catches a rejection on it, so the first session that fails to create (a
 * WebGPU execution provider the browser cannot initialize, an allocation
 * failure under memory pressure) fails every later Transformers.js session in
 * the page with the same error. Running the WASM lane first keeps a WebGPU
 * failure from taking the CPU measurement with it.
 */
export const RUNTIME_EXECUTION_ORDER: readonly BenchRuntimeId[] = [
  'transformers-wasm',
  'transformers-webgpu',
  'chrome-ai',
  'webllm',
  'mediapipe',
  'litert',
  'wllama-webgpu',
  'wllama',
] as const;

/**
 * Sort planned cells into a runtime execution order (stable within a
 * runtime). The order defaults to the protocol's `RUNTIME_EXECUTION_ORDER`;
 * a control run passes its own (see `controlRuntimeOrder`). The runner
 * applies this itself; exported for hosts and tests.
 *
 * @param cells - Planned cells in catalog order.
 * @param order - Runtime order to sort by; runtimes it does not list run last.
 * @returns A new array; the input is not modified.
 * @example
 * const ordered = orderCells(cells); // protocol order
 * const reversed = orderCells(cells, controlRuntimeOrder('order-reversed'));
 */
export function orderCells<T extends { model: { runtimeId: BenchRuntimeId } }>(
  cells: readonly T[],
  order: readonly BenchRuntimeId[] = RUNTIME_EXECUTION_ORDER,
): T[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...cells].sort(
    (a, b) =>
      (rank.get(a.model.runtimeId) ?? order.length) - (rank.get(b.model.runtimeId) ?? order.length),
  );
}

/** Control-run kinds a host may record on `harness.control`. */
export const CONTROL_KINDS: readonly ControlKind[] = [
  'order-reversed',
  'fixed-order',
  'wasm-default',
  'wasm-q8',
  'wasm-threads',
] as const;

/** The dtype a `wasm-default` control run loads the Transformers.js WASM lane at (Transformers.js's WASM default). */
export const CONTROL_WASM_DTYPE = 'q8' as const;

/** Largest `harness.control.wasmLane.numThreads` a run may carry. */
export const CONTROL_WASM_MAX_THREADS = 1024;

/**
 * How a WASM-lane control kind configures the Transformers.js WASM lane.
 *
 * - `dtype`: the dtype recorded on `wasmLane.dtype` (`q8`: every model of the
 *   lane loads its q8 files; `q4`: the protocol's files).
 * - `threads`: `all-cores` sets ONNX Runtime's WASM thread count to
 *   `navigator.hardwareConcurrency` (recorded as `wasmLane.numThreads`);
 *   `runtime-default` leaves it to the runtime (recorded as `null`).
 */
export interface ControlWasmLaneSpec {
  dtype: HarnessControlWasmLane['dtype'];
  threads: 'all-cores' | 'runtime-default';
}

/**
 * The WASM-lane settings of each control kind that changes the
 * Transformers.js WASM lane; the order kinds are absent. `wasm-q8` and
 * `wasm-threads` each make one of the two changes `wasm-default` makes, so
 * with `fixed-order` the four kinds form a 2x2 factorial.
 */
export const CONTROL_WASM_LANE_SPECS: Readonly<Partial<Record<ControlKind, ControlWasmLaneSpec>>> = {
  'wasm-default': { dtype: 'q8', threads: 'all-cores' },
  'wasm-q8': { dtype: 'q8', threads: 'runtime-default' },
  'wasm-threads': { dtype: 'q4', threads: 'all-cores' },
};

/** The kinds that carry `wasmLane`, in `CONTROL_KINDS` order. */
function wasmLaneKinds(): ControlKind[] {
  return CONTROL_KINDS.filter((k) => CONTROL_WASM_LANE_SPECS[k] !== undefined);
}

/**
 * The runtime execution order of a control run.
 *
 * `order-reversed` is the exact reverse of `RUNTIME_EXECUTION_ORDER`, so every
 * runtime that ran first under the protocol runs last, and the lane ratios of
 * the two orders can be compared. Note that it also runs the Transformers.js
 * WebGPU lane before its WASM lane, which the protocol order avoids (see
 * `RUNTIME_EXECUTION_ORDER`); a WebGPU session failure can therefore fail the
 * WASM lane of a control run, and is recorded as an error like any other.
 *
 * `fixed-order` is `RUNTIME_EXECUTION_ORDER` itself: a same-build, same-day
 * reference series for an order-reversed series, so that the two orders can
 * be compared within one browser build (protocol runs on the leaderboard may
 * come from another build), recorded as a control run so it stays out of
 * the leaderboard.
 *
 * `wasm-default`, `wasm-q8` and `wasm-threads` are `RUNTIME_EXECUTION_ORDER`
 * itself too: those kinds change the Transformers.js WASM lane's settings
 * (see `HarnessControl.wasmLane`), never the order.
 *
 * @param kind - The control kind.
 * @returns A new array of every runtime, each exactly once.
 * @example
 * controlRuntimeOrder('order-reversed')[0]; // 'wllama'
 * controlRuntimeOrder('fixed-order')[0]; // 'transformers-wasm'
 */
export function controlRuntimeOrder(kind: ControlKind): BenchRuntimeId[] {
  switch (kind) {
    case 'order-reversed':
      return [...RUNTIME_EXECUTION_ORDER].reverse();
    case 'fixed-order':
    case 'wasm-default':
    case 'wasm-q8':
    case 'wasm-threads':
      return [...RUNTIME_EXECUTION_ORDER];
  }
}

/** Options for `createHarnessControl`. */
export interface CreateHarnessControlOptions {
  /**
   * `wasm-default` and `wasm-threads` only, required there: the ONNX Runtime
   * WASM thread count the host sets for the Transformers.js WASM lane, the
   * browser's `navigator.hardwareConcurrency` (an integer from 1 to
   * `CONTROL_WASM_MAX_THREADS`). Refused on every other kind.
   */
  numThreads?: number;
}

/**
 * The `harness.control` record of a control run of the given kind.
 *
 * @param kind - The control kind.
 * @param options - `numThreads` for a `wasm-default` or `wasm-threads` run (required there, refused on the other kinds).
 * @returns `{ kind, runtimeOrder }` with the kind's canonical runtime order,
 *   plus `wasmLane` for a WASM-lane kind: `{ dtype: 'q8', numThreads, simd: true }`
 *   for `wasm-default`, `{ dtype: 'q8', numThreads: null, simd: true }` for
 *   `wasm-q8`, `{ dtype: 'q4', numThreads, simd: true }` for `wasm-threads`.
 * @throws {TypeError} When a kind that sets the thread count lacks a valid `numThreads`, or another kind is given one.
 * @example
 * const harness = { name, version, control: createHarnessControl('order-reversed') };
 * const wasm = createHarnessControl('wasm-default', { numThreads: navigator.hardwareConcurrency });
 * const q8 = createHarnessControl('wasm-q8'); // wasmLane.numThreads: null
 */
export function createHarnessControl(kind: ControlKind, options: CreateHarnessControlOptions = {}): HarnessControl {
  const control: HarnessControl = { kind, runtimeOrder: controlRuntimeOrder(kind) };
  const spec = CONTROL_WASM_LANE_SPECS[kind];
  if (spec?.threads !== 'all-cores' && options.numThreads !== undefined) {
    throw new TypeError(
      spec === undefined
        ? `createHarnessControl('${kind}') takes no numThreads; only ${threadKindsText()} set the WASM lane's threads`
        : `createHarnessControl('${kind}') takes no numThreads; it leaves ONNX Runtime's WASM thread count at the runtime's default`,
    );
  }
  if (spec === undefined) return control;
  const wasmLane: HarnessControlWasmLane = {
    dtype: spec.dtype,
    numThreads: spec.threads === 'all-cores' ? (options.numThreads as number) : null,
    simd: true,
  };
  const error = controlWasmLaneError({ ...control, wasmLane });
  if (error) throw new TypeError(`${error}; pass { numThreads: navigator.hardwareConcurrency }`);
  return { ...control, wasmLane };
}

/** "wasm-default" or "wasm-default and wasm-threads": the kinds that set the thread count. */
function threadKindsText(): string {
  const kinds = wasmLaneKinds().filter((k) => CONTROL_WASM_LANE_SPECS[k]?.threads === 'all-cores');
  return kinds.length === 1 ? kinds[0] : `${kinds.slice(0, -1).join(', ')} and ${kinds.at(-1)}`;
}

/**
 * The problem with a control marker's `wasmLane`, or undefined when it is
 * right for the kind. A WASM-lane kind must carry exactly its spec
 * (`CONTROL_WASM_LANE_SPECS`) and nothing else:
 * `wasm-default` `{ dtype: 'q8', numThreads: <integer 1-CONTROL_WASM_MAX_THREADS>, simd: true }`,
 * `wasm-q8` `{ dtype: 'q8', numThreads: null, simd: true }`,
 * `wasm-threads` `{ dtype: 'q4', numThreads: <integer 1-CONTROL_WASM_MAX_THREADS>, simd: true }`;
 * every other kind must carry no `wasmLane`. Shared by the runner (which
 * refuses the run before anything loads) and `validateRunShape`.
 *
 * @param control - A control marker whose `kind` is one of `CONTROL_KINDS`.
 * @returns The error message, or undefined.
 * @example
 * controlWasmLaneError(createHarnessControl('fixed-order')); // undefined
 */
export function controlWasmLaneError(control: { kind: ControlKind; wasmLane?: unknown }): string | undefined {
  const lane = control.wasmLane;
  const spec = CONTROL_WASM_LANE_SPECS[control.kind];
  if (spec === undefined) {
    if (lane === undefined) return undefined;
    const kinds = wasmLaneKinds();
    const named = kinds.length === 1 ? kinds[0] : `${kinds.slice(0, -1).join(', ')} or ${kinds.at(-1)}`;
    return `harness.control.wasmLane is set only on a ${named} control run, not on ${control.kind}`;
  }
  const threadsText = spec.threads === 'all-cores' ? `<integer 1-${CONTROL_WASM_MAX_THREADS}>` : 'null';
  const shape = `harness.control.wasmLane must be { dtype: '${spec.dtype}', numThreads: ${threadsText}, simd: true } on a ${control.kind} control run`;
  if (typeof lane !== 'object' || lane === null || Array.isArray(lane)) return shape;
  const { dtype, numThreads, simd, ...extra } = lane as Record<string, unknown>;
  const threadsOk =
    spec.threads === 'all-cores'
      ? typeof numThreads === 'number' && Number.isInteger(numThreads) && numThreads >= 1 && numThreads <= CONTROL_WASM_MAX_THREADS
      : numThreads === null;
  if (dtype !== spec.dtype || !threadsOk || simd !== true || Object.keys(extra).length > 0) return shape;
  return undefined;
}

/**
 * Whether a run is a control run: its `harness` carries a `control` key with
 * any value other than `undefined` (a malformed marker counts, so a refusal
 * keyed on it cannot be sidestepped). A control run is never submitted,
 * published or scored.
 *
 * @param run - Any run-shaped value.
 * @returns True when `harness.control` is present.
 * @example
 * if (isControlRun(run)) return reject('control runs are never published');
 */
export function isControlRun(run: unknown): boolean {
  if (typeof run !== 'object' || run === null) return false;
  const harness = (run as { harness?: unknown }).harness;
  return typeof harness === 'object' && harness !== null && (harness as { control?: unknown }).control !== undefined;
}

/** Run policy for a suite (part of the versioned protocol). */
export interface RunPolicy {
  /** Untimed warmup generations per cell (absorbs shader compile/JIT). */
  warmupRuns: number;
  /** Timed iterations per cell. */
  timedRuns: number;
  /** Idle cool-down between cells (thermal recovery), ms. */
  cooldownMs: number;
  /** Gate the next cell on Compute Pressure <= 'fair' when available. */
  pressureGate: boolean;
  /** Max wait for the pressure gate before proceeding anyway, ms. */
  pressureGateTimeoutMs: number;
  /** After a cold load, dispose + reload to also measure the warm load. */
  measureWarmReload: boolean;
  /** CV above this fraction marks a summary metric as high-variance. */
  highVarianceCv: number;
  /**
   * Watchdog: a load that reports no progress for this long is aborted as a
   * timeout (stall-based, so a slow link keeps downloading as long as bytes
   * arrive).
   */
  loadStallMs: number;
  /** Watchdog: absolute cap on one load attempt. */
  loadTimeoutMs: number;
  /**
   * Watchdog: a generation (warmup or timed iteration) whose stream delivers
   * nothing for this long is aborted as a timeout. A runtime surface that
   * flushes every chunk in a terminal burst (LiteRT-LM) stays silent for the
   * whole request, so this is well above a full request.
   */
  chunkStallMs: number;
  /** Watchdog: absolute cap on one generation or embedding call. */
  iterationTimeoutMs: number;
  /** Watchdog: absolute cap on one quality-lane cell (many generations). */
  qualityTimeoutMs: number;
  /**
   * Attempts per cell (and per model load) before the cell is recorded as an
   * error and the run moves on. Every failed attempt stays on the cell in
   * `attempts`; retries are never silent.
   */
  maxAttempts: number;
  /**
   * How long the runner waits for a hidden tab to become visible again before
   * a timed iteration starts, or before it repeats an iteration the tab hid
   * during. An iteration measured while hidden is kept on the cell in
   * `discardedIterations` and repeated (up to `maxAttempts` times per
   * iteration); a tab that stays hidden past this wait leaves the cell invalid.
   */
  visibilityWaitMs: number;
}

/** Watchdog budgets shared by every shipped policy. */
const WATCHDOG = {
  loadStallMs: 180_000,
  loadTimeoutMs: 45 * 60_000,
  chunkStallMs: 120_000,
  iterationTimeoutMs: 10 * 60_000,
  qualityTimeoutMs: 30 * 60_000,
  maxAttempts: 2,
  visibilityWaitMs: 10 * 60_000,
} as const;

/** Policies per suite preset. */
export const RUN_POLICIES: Record<'quick' | 'standard' | 'thorough', RunPolicy> = {
  quick: {
    warmupRuns: 1,
    timedRuns: 3,
    cooldownMs: 5_000,
    pressureGate: true,
    pressureGateTimeoutMs: 15_000,
    measureWarmReload: false,
    highVarianceCv: 0.05,
    ...WATCHDOG,
  },
  standard: {
    warmupRuns: 1,
    timedRuns: 3,
    cooldownMs: 8_000,
    pressureGate: true,
    pressureGateTimeoutMs: 30_000,
    measureWarmReload: true,
    highVarianceCv: 0.05,
    ...WATCHDOG,
  },
  thorough: {
    warmupRuns: 1,
    timedRuns: 5,
    cooldownMs: 10_000,
    pressureGate: true,
    pressureGateTimeoutMs: 30_000,
    measureWarmReload: true,
    highVarianceCv: 0.05,
    ...WATCHDOG,
    // Thorough cells run five timed iterations of multi-GB models on slow devices.
    iterationTimeoutMs: 15 * 60_000,
    qualityTimeoutMs: 45 * 60_000,
  },
};
