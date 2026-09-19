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
  EmbedWorkloadSpec,
  LLMWorkloadSpec,
  QualityWorkloadSpec,
} from './types.js';

/**
 * ~128-token prompt (measured 512 chars). Original text, public domain.
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

/** ~512-token prompt (measured 2178 chars). Original text, public domain. */
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
 * runs; it is a reproducibility measure, not a correctness fix. (The
 * Transformers.js ORT-web lanes fail during session creation regardless of
 * where they run in the order - a separate open runtime/adapter issue.) The
 * order runs the WASM-arena runtimes first and the multi-GB-heap runtimes last.
 * Within a runtime, catalog order is preserved.
 */
export const RUNTIME_EXECUTION_ORDER: readonly BenchRuntimeId[] = [
  'transformers-webgpu',
  'transformers-wasm',
  'chrome-ai',
  'webllm',
  'mediapipe',
  'litert',
  'wllama',
] as const;

/**
 * Sort planned cells into the protocol execution order (stable within a
 * runtime). The runner applies this itself; exported for hosts and tests.
 */
export function orderCells<T extends { model: { runtimeId: BenchRuntimeId } }>(
  cells: readonly T[],
): T[] {
  const rank = new Map(RUNTIME_EXECUTION_ORDER.map((id, i) => [id, i]));
  return [...cells].sort(
    (a, b) =>
      (rank.get(a.model.runtimeId) ?? RUNTIME_EXECUTION_ORDER.length) -
      (rank.get(b.model.runtimeId) ?? RUNTIME_EXECUTION_ORDER.length),
  );
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
}

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
  },
  standard: {
    warmupRuns: 1,
    timedRuns: 3,
    cooldownMs: 8_000,
    pressureGate: true,
    pressureGateTimeoutMs: 30_000,
    measureWarmReload: true,
    highVarianceCv: 0.05,
  },
  thorough: {
    warmupRuns: 1,
    timedRuns: 5,
    cooldownMs: 10_000,
    pressureGate: true,
    pressureGateTimeoutMs: 30_000,
    measureWarmReload: true,
    highVarianceCv: 0.05,
  },
};
