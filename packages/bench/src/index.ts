/**
 * @localmode/bench — cross-runtime benchmark harness for in-browser AI.
 *
 * Measures LLM + embedding inference across browser ML runtimes with
 * MLPerf-Client-compatible metric definitions (TTFT; decode rate excluding
 * the first token; ppN/tgN naming), raw per-chunk traces for auditability,
 * versioned plausibility rules for community submissions, and leaderboard
 * aggregation. Provider runtimes are injected via adapters — this package
 * has zero runtime dependencies.
 */

// Protocol types + constants
export {
  BENCH_PROTOCOL_VERSION,
  BENCH_SCHEMA_VERSION,
} from './types.js';
export type {
  BenchSuiteId,
  BenchRuntimeId,
  BenchWorkloadKind,
  LLMWorkloadSpec,
  EmbedWorkloadSpec,
  QualityWorkloadSpec,
  BenchWorkloadSpec,
  BenchModelRef,
  BenchChunk,
  ProviderUsage,
  LLMIteration,
  EmbedIteration,
  LoadRecord,
  MemorySample,
  QualityResult,
  BenchCellStatus,
  BenchCellResult,
  TraceEvent,
  BrowserInfo,
  OSInfo,
  GPUInfo,
  EnvironmentCapture,
  FingerprintResult,
  MetricSummary,
  CellSummary,
  BenchRunResult,
  PlausibilityFlag,
  ValidationReport,
} from './types.js';

// Workloads + run policy
export {
  LLM_WORKLOADS,
  EMBED_WORKLOADS,
  QUALITY_WORKLOADS,
  WORKLOADS_BY_ID,
  RUN_POLICIES,
  GENERATION_BUDGET,
  MIN_GENERATED_CHARS,
  RUNTIME_EXECUTION_ORDER,
  orderCells,
} from './protocol.js';
export type { RunPolicy } from './protocol.js';

// Adapters
export type {
  BenchStreamChunk,
  BenchLanguageModel,
  BenchEmbeddingModel,
  AdapterAvailability,
  AdapterLoadProgress,
  LoadedLLM,
  LoadedEmbedder,
  LLMRuntimeAdapter,
  EmbeddingRuntimeAdapter,
} from './adapter.js';
export { USAGE_FIDELITY } from './adapter.js';

// Runner
export { runBenchmarkSuite } from './runner.js';
export type { PlannedCell, RunnerHooks, RunSuiteOptions } from './runner.js';

// Environment + measurement
export { captureEnvironment } from './env.js';
export { memoryApiAvailable, sampleMemoryBytes } from './memory.js';
export { hrNow, inferTimerResolutionUs, sleep } from './timing.js';
export { runFingerprint } from './fingerprint.js';
export { TraceRecorder } from './trace.js';

// Statistics
export { median, mean, stddev, quantile, geomean, summarize, spearman } from './stats.js';

// Validation + integrity
export {
  PLAUSIBILITY_RULES_VERSION,
  STREAM_COHERENCE_MIN_SPAN_RATIO,
  validateRunShape,
  summarizeCell,
  summarizeRun,
  checkPlausibility,
  validateSubmission,
  isIncrementalStream,
} from './validate.js';
export { canonicalJson, sha256Hex, computeRunDigest, verifyRunDigest } from './canonical.js';

// Aggregation (leaderboard + paper tooling)
export {
  aggregateRuns,
  deviceClassOf,
  rowsToCSV,
  runsToLongCSV,
  HEADLINE_MIN_SUBMISSIONS,
} from './aggregate.js';
export type { LeaderboardRow } from './aggregate.js';

// Quality-fidelity lane
export {
  runMMLUFidelity,
  runSTSQuality,
  formatMMLUPrompt,
  parseMMLUAnswer,
  MMLU_MAX_TOKENS,
  MMLU_OUTPUT_CAP,
} from './quality.js';
export { TINY_MMLU } from './datasets/tiny-mmlu.js';
export type { MMLUItem } from './datasets/tiny-mmlu.js';
export { STSB_SUBSET } from './datasets/stsb/stsb-subset.js';
export type { STSPair } from './datasets/stsb/stsb-subset.js';
