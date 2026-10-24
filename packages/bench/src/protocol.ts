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
  BenchCellProfile,
  BenchRuntimeId,
  ControlKind,
  EmbedWorkloadSpec,
  GapStats,
  HarnessControl,
  HarnessControlWasmLane,
  LLMWorkloadSpec,
  QualityWorkloadSpec,
  WllamaBuild,
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
  'wllama-compat',
  'current-releases',
  'ort-profile',
  'llamacpp-profile',
] as const;

/** The values a llama.cpp cell's `runtimeConfig.wllamaBuild` may take (see `WllamaBuild`). */
export const WLLAMA_BUILDS: readonly WllamaBuild[] = ['compat', 'memory64'] as const;

/** The llama.cpp lanes, the only cells that carry `runtimeConfig.wllamaBuild`. */
const LLAMA_CPP_RUNTIMES: readonly BenchRuntimeId[] = ['wllama', 'wllama-webgpu'];

/**
 * The wllama build each control kind that changes the llama.cpp lanes loads
 * them through (recorded on `harness.control.wllamaBuild`); every other kind
 * is absent and leaves the build to wllama.
 */
export const CONTROL_WLLAMA_BUILDS: Readonly<Partial<Record<ControlKind, 'compat'>>> = {
  'wllama-compat': 'compat',
};

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
 * (see `HarnessControl.wasmLane`), never the order. So is `wllama-compat`,
 * which changes only the wllama build of the llama.cpp lanes (see
 * `HarnessControl.wllamaBuild`), and so are `current-releases` (the runtime
 * versions, see `HarnessControl.runtimeVersions`), `ort-profile` and
 * `llamacpp-profile` (a profiler, see `BenchCellResult.profile`).
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
    case 'wllama-compat':
    case 'current-releases':
    case 'ort-profile':
    case 'llamacpp-profile':
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
  /**
   * `current-releases` only, required there: the runtime package versions
   * the run loads, package name to version, one entry for each of
   * `CONTROL_CURRENT_RELEASE_PACKAGES` (plus, optionally, the packages in
   * `CONTROL_CURRENT_RELEASE_OPTIONAL_PACKAGES`). Refused on every other kind.
   */
  runtimeVersions?: Record<string, string>;
}

/**
 * The runtime packages a `current-releases` control run loads at their
 * current npm releases, each recorded in `harness.control.runtimeVersions`.
 */
export const CONTROL_CURRENT_RELEASE_PACKAGES: readonly string[] = [
  '@huggingface/transformers',
  '@mlc-ai/web-llm',
  '@wllama/wllama',
  '@wllama/wllama-compat',
  '@litert-lm/core',
] as const;

/**
 * Packages a `current-releases` record may also list: the ONNX Runtime Web
 * build the current Transformers.js release ships with.
 */
export const CONTROL_CURRENT_RELEASE_OPTIONAL_PACKAGES: readonly string[] = ['onnxruntime-web'] as const;

/**
 * The runtime package each lane of a `current-releases` control run loads
 * (the lanes whose runtime the kind changes); every cell of these lanes
 * records that package's version as `runtimeConfig.runtimeVersion`.
 */
export const CURRENT_RELEASE_LANE_PACKAGES: Readonly<Partial<Record<BenchRuntimeId, string>>> = {
  'transformers-webgpu': '@huggingface/transformers',
  'transformers-wasm': '@huggingface/transformers',
  webllm: '@mlc-ai/web-llm',
  wllama: '@wllama/wllama',
  'wllama-webgpu': '@wllama/wllama',
  litert: '@litert-lm/core',
};

/** A version string: `major.minor.patch` with an optional pre-release suffix. */
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]{1,64})?$/;

/**
 * The profile kind each profile control kind records on `cells[].profile`,
 * and the lanes it records it on.
 */
export const CONTROL_PROFILE_SPECS: Readonly<
  Partial<Record<ControlKind, { profileKind: BenchCellProfile['kind']; lanes: readonly BenchRuntimeId[] }>>
> = {
  'ort-profile': { profileKind: 'ort-operators', lanes: ['transformers-webgpu', 'transformers-wasm'] },
  'llamacpp-profile': { profileKind: 'llamacpp-delivery', lanes: ['wllama', 'wllama-webgpu'] },
};

/** Most operator rows an `ort-operators` profile carries before the rest fold into `(other)`. */
export const PROFILE_MAX_OPERATOR_ROWS = 100;

/** Most requests a `llamacpp-delivery` profile carries (one entry each). */
export const PROFILE_MAX_ITERATIONS = 64;

/** The `GapStats` fields of a `llamacpp-delivery` iteration. */
const LLAMACPP_GAP_KEYS = [
  'emitGapMs',
  'recvGapMs',
  'chunkGapMs',
  'workerMs',
  'roundTripTransitMs',
  'receiptToChunkMs',
  'pageTurnaroundMs',
] as const;

/** Histogram bin edges of a `llamacpp-delivery` profile, ms. */
export const LLAMACPP_PROFILE_BIN_EDGES_MS: readonly number[] = [0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000] as const;

/**
 * The `harness.control` record of a control run of the given kind.
 *
 * @param kind - The control kind.
 * @param options - `numThreads` for a `wasm-default` or `wasm-threads` run, `runtimeVersions` for a
 *   `current-releases` run (each required on its kinds, refused on the others).
 * @returns `{ kind, runtimeOrder }` with the kind's canonical runtime order,
 *   plus `wasmLane` for a WASM-lane kind: `{ dtype: 'q8', numThreads, simd: true }`
 *   for `wasm-default`, `{ dtype: 'q8', numThreads: null, simd: true }` for
 *   `wasm-q8`, `{ dtype: 'q4', numThreads, simd: true }` for `wasm-threads`;
 *   plus `wllamaBuild: 'compat'` for `wllama-compat`; plus `runtimeVersions` for `current-releases`.
 * @throws {TypeError} When a kind that sets the thread count lacks a valid `numThreads`, or another kind is given one;
 *   when `current-releases` lacks valid `runtimeVersions`, or another kind is given them.
 * @example
 * const harness = { name, version, control: createHarnessControl('order-reversed') };
 * const wasm = createHarnessControl('wasm-default', { numThreads: navigator.hardwareConcurrency });
 * const q8 = createHarnessControl('wasm-q8'); // wasmLane.numThreads: null
 */
export function createHarnessControl(kind: ControlKind, options: CreateHarnessControlOptions = {}): HarnessControl {
  const build = CONTROL_WLLAMA_BUILDS[kind];
  const control: HarnessControl = {
    kind,
    runtimeOrder: controlRuntimeOrder(kind),
    ...(build !== undefined ? { wllamaBuild: build } : {}),
  };
  const versionsError = controlRuntimeVersionsError({ kind, runtimeVersions: options.runtimeVersions });
  if (versionsError) throw new TypeError(versionsError);
  if (options.runtimeVersions !== undefined) control.runtimeVersions = { ...options.runtimeVersions };
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
 * The problem with a control marker's `wllamaBuild`, or undefined when it is
 * right for the kind: a kind listed in `CONTROL_WLLAMA_BUILDS` must carry
 * exactly its build (`wllama-compat`: `'compat'`), every other kind none.
 * Shared by the runner (which refuses the run before anything loads) and
 * `validateRunShape`.
 *
 * @param control - A control marker whose `kind` is one of `CONTROL_KINDS`.
 * @returns The error message, or undefined.
 * @example
 * controlWllamaBuildError(createHarnessControl('wllama-compat')); // undefined
 * controlWllamaBuildError({ kind: 'fixed-order', wllamaBuild: 'compat' });
 * // 'harness.control.wllamaBuild is set only on a wllama-compat control run, not on fixed-order'
 */
export function controlWllamaBuildError(control: { kind: ControlKind; wllamaBuild?: unknown }): string | undefined {
  const expected = CONTROL_WLLAMA_BUILDS[control.kind];
  if (expected === undefined) {
    if (control.wllamaBuild === undefined) return undefined;
    const kinds = CONTROL_KINDS.filter((k) => CONTROL_WLLAMA_BUILDS[k] !== undefined);
    return `harness.control.wllamaBuild is set only on a ${kinds.join(' or ')} control run, not on ${control.kind}`;
  }
  if (control.wllamaBuild !== expected) {
    return `harness.control.wllamaBuild must be '${expected}' on a ${control.kind} control run`;
  }
  return undefined;
}

/**
 * The problem with a cell's `runtimeConfig.wllamaBuild`, or undefined when it
 * is fine (since bench 0.9.13).
 *
 * - The value is `compat` or `memory64` (`WLLAMA_BUILDS`), on a llama.cpp
 *   cell (`wllama`, `wllama-webgpu`) only.
 * - On a run whose control marker names a build (`wllama-compat`), a
 *   llama.cpp cell that carries a `runtimeConfig` and whose engine loaded
 *   (`resolvedBackend` `wasm` or `webgpu`) must record that build.
 * - A cell without the record is otherwise not checked: every run before
 *   0.9.13 lacks it, and a cell whose engine never started has none.
 *
 * @param cell - A cell-shaped value.
 * @param control - The run's `harness.control`, when it has one.
 * @returns The error message, or undefined.
 * @example
 * wllamaBuildError({ runtimeId: 'wllama', runtimeConfig: { wllamaBuild: 'wasm64' } });
 * // 'runtimeConfig.wllamaBuild must be "compat" or "memory64", got "wasm64"'
 */
export function wllamaBuildError(
  cell: { runtimeId?: unknown; resolvedBackend?: unknown; runtimeConfig?: unknown },
  control?: { kind?: unknown; wllamaBuild?: unknown } | null,
): string | undefined {
  const rc = cell.runtimeConfig;
  const config = typeof rc === 'object' && rc !== null ? (rc as Record<string, unknown>) : undefined;
  const isLlamaCpp = LLAMA_CPP_RUNTIMES.includes(cell.runtimeId as BenchRuntimeId);
  const present = config !== undefined && 'wllamaBuild' in config;
  if (present) {
    if (!isLlamaCpp) {
      return `runtimeConfig.wllamaBuild is set only on a llama.cpp cell (${LLAMA_CPP_RUNTIMES.join(', ')}), not on ${String(cell.runtimeId)}`;
    }
    const value = config.wllamaBuild;
    if (!WLLAMA_BUILDS.includes(value as WllamaBuild)) {
      return `runtimeConfig.wllamaBuild must be ${WLLAMA_BUILDS.map((b) => `"${b}"`).join(' or ')}, got ${JSON.stringify(value)}`;
    }
  }
  const required = control && CONTROL_KINDS.includes(control.kind as ControlKind) ? CONTROL_WLLAMA_BUILDS[control.kind as ControlKind] : undefined;
  if (required === undefined || !isLlamaCpp) return undefined;
  if (present) {
    if (config.wllamaBuild !== required) {
      return `runtimeConfig.wllamaBuild is ${JSON.stringify(config.wllamaBuild)} on a ${String(control?.kind)} control run, which loads every llama.cpp lane through the compatibility build`;
    }
    return undefined;
  }
  if (config !== undefined && (cell.resolvedBackend === 'wasm' || cell.resolvedBackend === 'webgpu')) {
    return `runtimeConfig.wllamaBuild is missing on a llama.cpp cell of a ${String(control?.kind)} control run`;
  }
  return undefined;
}

/**
 * The problem with a control marker's `runtimeVersions`, or undefined when it
 * is right for the kind: a `current-releases` marker must carry an object
 * with a version (`1.2.3`, optionally with a pre-release suffix) for each of
 * `CONTROL_CURRENT_RELEASE_PACKAGES` and no keys beyond those and
 * `CONTROL_CURRENT_RELEASE_OPTIONAL_PACKAGES`; every other kind none. Shared
 * by `createHarnessControl`, the runner and `validateRunShape`.
 *
 * @param control - A control marker whose `kind` is one of `CONTROL_KINDS`.
 * @returns The error message, or undefined.
 * @example
 * controlRuntimeVersionsError({ kind: 'current-releases', runtimeVersions: {} });
 * // 'harness.control.runtimeVersions must give a version for @huggingface/transformers on a current-releases control run'
 */
export function controlRuntimeVersionsError(control: { kind: ControlKind; runtimeVersions?: unknown }): string | undefined {
  const versions = control.runtimeVersions;
  if (control.kind !== 'current-releases') {
    return versions === undefined ? undefined : `harness.control.runtimeVersions is set only on a current-releases control run, not on ${control.kind}`;
  }
  if (typeof versions !== 'object' || versions === null || Array.isArray(versions)) {
    return 'harness.control.runtimeVersions must be an object of package name to version on a current-releases control run';
  }
  const record = versions as Record<string, unknown>;
  for (const pkg of CONTROL_CURRENT_RELEASE_PACKAGES) {
    if (typeof record[pkg] !== 'string' || !VERSION_PATTERN.test(record[pkg] as string)) {
      return `harness.control.runtimeVersions must give a version for ${pkg} on a current-releases control run`;
    }
  }
  for (const [pkg, version] of Object.entries(record)) {
    if (CONTROL_CURRENT_RELEASE_PACKAGES.includes(pkg)) continue;
    if (!CONTROL_CURRENT_RELEASE_OPTIONAL_PACKAGES.includes(pkg)) {
      return `harness.control.runtimeVersions lists ${JSON.stringify(pkg)}, which is not one of ${[...CONTROL_CURRENT_RELEASE_PACKAGES, ...CONTROL_CURRENT_RELEASE_OPTIONAL_PACKAGES].join(', ')}`;
    }
    if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) {
      return `harness.control.runtimeVersions[${JSON.stringify(pkg)}] must be a version string`;
    }
  }
  return undefined;
}

/**
 * The problem with a cell's `runtimeConfig.runtimeVersion`, or undefined
 * when it is fine (since bench 0.9.14). The field belongs to a
 * `current-releases` control run: there, a cell of a lane whose runtime the
 * kind changes (`CURRENT_RELEASE_LANE_PACKAGES`) that carries a
 * `runtimeConfig` must record the version of its package from
 * `harness.control.runtimeVersions`, and so must the cell's own
 * `runtimeVersion` when present. Any other run, and any other lane, carries
 * none.
 *
 * @param cell - A cell-shaped value.
 * @param control - The run's `harness.control`, when it has one.
 * @returns The error message, or undefined.
 * @example
 * runtimeVersionCellError({ runtimeId: 'webllm', runtimeConfig: { runtimeVersion: '0.2.86' } }, null);
 * // 'runtimeConfig.runtimeVersion is set only on a current-releases control run'
 */
export function runtimeVersionCellError(
  cell: { runtimeId?: unknown; runtimeVersion?: unknown; runtimeConfig?: unknown },
  control?: { kind?: unknown; runtimeVersions?: unknown } | null,
): string | undefined {
  const rc = cell.runtimeConfig;
  const config = typeof rc === 'object' && rc !== null ? (rc as Record<string, unknown>) : undefined;
  const present = config !== undefined && 'runtimeVersion' in config;
  const pkg = CURRENT_RELEASE_LANE_PACKAGES[cell.runtimeId as BenchRuntimeId];
  if (control?.kind !== 'current-releases') {
    return present ? 'runtimeConfig.runtimeVersion is set only on a current-releases control run' : undefined;
  }
  if (pkg === undefined) {
    return present
      ? `runtimeConfig.runtimeVersion is set only on a lane whose runtime current-releases changes (${Object.keys(CURRENT_RELEASE_LANE_PACKAGES).join(', ')}), not on ${String(cell.runtimeId)}`
      : undefined;
  }
  if (config === undefined) return undefined;
  const versions = control.runtimeVersions;
  const expected = typeof versions === 'object' && versions !== null ? (versions as Record<string, unknown>)[pkg] : undefined;
  if (!present) return `runtimeConfig.runtimeVersion is missing on a ${String(cell.runtimeId)} cell of a current-releases control run`;
  if (config.runtimeVersion !== expected) {
    return `runtimeConfig.runtimeVersion is ${JSON.stringify(config.runtimeVersion)} but harness.control.runtimeVersions gives ${pkg} ${JSON.stringify(expected)}`;
  }
  if (cell.runtimeVersion !== undefined && cell.runtimeVersion !== expected) {
    return `runtimeVersion is ${JSON.stringify(cell.runtimeVersion)} but harness.control.runtimeVersions gives ${pkg} ${JSON.stringify(expected)}`;
  }
  return undefined;
}

const isNonNegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isShortString = (v: unknown): v is string => typeof v === 'string' && v.length >= 1 && v.length <= 200;

/** The problem with one `GapStats`, or undefined. */
function gapStatsError(value: unknown, bins: number, at: string): string | undefined {
  if (typeof value !== 'object' || value === null) return `${at} must be an object`;
  const g = value as Record<string, unknown>;
  if (!isCount(g.n)) return `${at}.n must be a non-negative integer`;
  for (const key of ['p50', 'p90', 'p99', 'max', 'mean'] as const) {
    if (!isNonNegative(g[key])) return `${at}.${key} must be a non-negative number`;
  }
  const h = g.histogram;
  if (!Array.isArray(h) || h.length !== bins || !h.every(isCount)) {
    return `${at}.histogram must be ${bins} non-negative integer counts`;
  }
  if (h.reduce((a: number, b: number) => a + b, 0) !== g.n) return `${at}.histogram counts must sum to n`;
  return undefined;
}

/**
 * The problem with a cell's `profile`, or undefined when it is fine (since
 * bench 0.9.14). A profile belongs to a profile control run
 * (`CONTROL_PROFILE_SPECS`): `ort-operators` on a Transformers.js cell of an
 * `ort-profile` run, `llamacpp-delivery` on a llama.cpp cell of a
 * `llamacpp-profile` run, each in its bounded shape (at most
 * `PROFILE_MAX_OPERATOR_ROWS` operator rows plus an `(other)` row per phase and timing source, at most
 * `PROFILE_MAX_ITERATIONS` requests, histograms over
 * `LLAMACPP_PROFILE_BIN_EDGES_MS`). Any other run or lane carries none. A
 * profiled lane's cell may lack one (a cell that errored, or one the host
 * does not profile).
 *
 * @param cell - A cell-shaped value.
 * @param control - The run's `harness.control`, when it has one.
 * @returns The error message, or undefined.
 * @example
 * cellProfileError({ runtimeId: 'webllm', profile: { kind: 'ort-operators' } }, { kind: 'ort-profile' });
 * // 'profile is set only on a transformers-webgpu or transformers-wasm cell of an ort-profile control run, not on webllm'
 */
export function cellProfileError(
  cell: { runtimeId?: unknown; profile?: unknown },
  control?: { kind?: unknown } | null,
): string | undefined {
  if (cell.profile === undefined) return undefined;
  const kind = control?.kind as ControlKind | undefined;
  const spec = kind !== undefined ? CONTROL_PROFILE_SPECS[kind] : undefined;
  if (spec === undefined) {
    const kinds = CONTROL_KINDS.filter((k) => CONTROL_PROFILE_SPECS[k] !== undefined);
    return `profile is set only on a ${kinds.join(' or ')} control run`;
  }
  if (!spec.lanes.includes(cell.runtimeId as BenchRuntimeId)) {
    return `profile is set only on a ${spec.lanes.join(' or ')} cell of an ${kind} control run, not on ${String(cell.runtimeId)}`;
  }
  const profile = cell.profile as Record<string, unknown> | null;
  if (typeof profile !== 'object' || profile === null || Array.isArray(profile)) return 'profile must be an object';
  if (profile.kind !== spec.profileKind) return `profile.kind must be "${spec.profileKind}" on an ${kind} control run`;
  if (spec.profileKind === 'ort-operators') {
    const pass = profile.pass as Record<string, unknown> | null | undefined;
    if (typeof pass !== 'object' || pass === null || !isCount(pass.warmupTokens) || !(isCount(pass.maxTokens) && pass.maxTokens > 0)) {
      return 'profile.pass must be { warmupTokens, maxTokens } (integers, maxTokens at least 1)';
    }
    if ('failedMaxTokens' in pass) {
      const failed = pass.failedMaxTokens;
      if (!Array.isArray(failed) || failed.length === 0 || failed.length > 8 || !failed.every((n) => isCount(n) && n > (pass.maxTokens as number))) {
        return 'profile.pass.failedMaxTokens must list 1 to 8 token budgets, each above pass.maxTokens';
      }
    }
    for (const key of ['runs', 'nodeEvents'] as const) if (!isCount(profile[key])) return `profile.${key} must be a non-negative integer`;
    for (const key of ['modelRunMs', 'nodeMs'] as const) if (!isNonNegative(profile[key])) return `profile.${key} must be a non-negative number`;
    if ('gpuMs' in profile && !isNonNegative(profile.gpuMs)) return 'profile.gpuMs must be a non-negative number when present';
    if ('foldedRows' in profile && !(isCount(profile.foldedRows) && profile.foldedRows > 0)) return 'profile.foldedRows must be a positive integer when present';
    if ('truncated' in profile && profile.truncated !== true) return 'profile.truncated must be true when present';
    const rows = profile.operators;
    if (!Array.isArray(rows) || rows.length > PROFILE_MAX_OPERATOR_ROWS + 4) {
      return `profile.operators must be an array of at most ${PROFILE_MAX_OPERATOR_ROWS + 4} rows`;
    }
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Record<string, unknown> | null;
      if (
        typeof row !== 'object' || row === null ||
        !isShortString(row.opType) || !isShortString(row.kernel) || !isShortString(row.provider) ||
        (row.phase !== 'prefill' && row.phase !== 'decode') ||
        (row.timing !== 'node' && row.timing !== 'gpu') ||
        !isNonNegative(row.totalMs) || !(isCount(row.count) && row.count > 0)
      ) {
        return `profile.operators[${i}] must be { phase: "prefill" | "decode", timing: "node" | "gpu", opType, kernel, provider, totalMs, count }`;
      }
    }
    return undefined;
  }
  const edges = profile.binEdgesMs;
  if (!Array.isArray(edges) || edges.length !== LLAMACPP_PROFILE_BIN_EDGES_MS.length || edges.some((e, i) => e !== LLAMACPP_PROFILE_BIN_EDGES_MS[i])) {
    return `profile.binEdgesMs must be [${LLAMACPP_PROFILE_BIN_EDGES_MS.join(', ')}]`;
  }
  const iterations = profile.iterations;
  if (!Array.isArray(iterations) || iterations.length > PROFILE_MAX_ITERATIONS) {
    return `profile.iterations must be an array of at most ${PROFILE_MAX_ITERATIONS} entries`;
  }
  for (let i = 0; i < iterations.length; i++) {
    const it = iterations[i] as Record<string, unknown> | null;
    if (typeof it !== 'object' || it === null) return `profile.iterations[${i}] must be an object`;
    if (!isCount(it.tokens) || !isCount(it.chunks) || !isCount(it.messages)) {
      return `profile.iterations[${i}] needs integer tokens, chunks and messages`;
    }
    for (const key of LLAMACPP_GAP_KEYS) {
      const error = gapStatsError(it[key], edges.length, `profile.iterations[${i}].${key}`);
      if (error) return error;
    }
    if ('clockOffsetMs' in it && !(typeof it.clockOffsetMs === 'number' && Number.isFinite(it.clockOffsetMs) && Math.abs(it.clockOffsetMs) <= 60_000)) {
      return `profile.iterations[${i}].clockOffsetMs must be a number of at most 60000 ms either way when present`;
    }
  }
  return undefined;
}

/**
 * Summarize durations into a `GapStats` over `edges`: count, nearest-rank
 * percentiles, max, mean, and a histogram (bin i counts values in
 * [edges[i], edges[i+1]); the last bin is open; a value below the first edge
 * counts in the first bin).
 *
 * @param values - Durations, ms.
 * @param edges - Bin edges, ms, ascending (default `LLAMACPP_PROFILE_BIN_EDGES_MS`).
 * @returns The summary; every statistic 0 when `values` is empty.
 * @example
 * summarizeGaps([1, 2, 650]).p50; // 2
 */
export function summarizeGaps(values: readonly number[], edges: readonly number[] = LLAMACPP_PROFILE_BIN_EDGES_MS): GapStats {
  const finite = values.filter((v) => Number.isFinite(v)).map((v) => Math.max(0, v));
  const sorted = [...finite].sort((a, b) => a - b);
  const n = sorted.length;
  const pick = (q: number) => (n === 0 ? 0 : sorted[Math.min(n - 1, Math.max(0, Math.ceil(q * n) - 1))]);
  const round = (v: number) => Math.round(v * 1000) / 1000;
  const histogram = edges.map(() => 0);
  for (const v of sorted) {
    let bin = 0;
    for (let i = edges.length - 1; i >= 0; i--) {
      if (v >= edges[i]) {
        bin = i;
        break;
      }
    }
    histogram[bin]++;
  }
  return {
    n,
    p50: round(pick(0.5)),
    p90: round(pick(0.9)),
    p99: round(pick(0.99)),
    max: round(n === 0 ? 0 : sorted[n - 1]),
    mean: round(n === 0 ? 0 : sorted.reduce((a, b) => a + b, 0) / n),
    histogram,
  };
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
