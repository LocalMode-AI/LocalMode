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
  LEADERBOARD_PROTOCOL_VERSIONS,
  BENCH_SCHEMA_VERSION,
  ACCEPTED_SCHEMA_VERSIONS,
  TASKS_PROTOCOL_VERSION,
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
  WebGLInfo,
  DeviceInfo,
  DeviceType,
  WasmFeatureSupport,
  APIAvailability,
  NetworkInfo,
  DisplayInfo,
  LocaleInfo,
  HarnessInfo,
  HarnessSeries,
  HarnessControl,
  HarnessControlWasmLane,
  WllamaBuild,
  ControlKind,
  UserReportedHardware,
  EnvironmentCapture,
  FingerprintResult,
  MetricSummary,
  CellSummary,
  BenchRunResult,
  PlausibilityFlag,
  ValidationReport,
  BenchCellProfile,
  OrtOperatorProfile,
  OrtOperatorRow,
  LlamaCppDeliveryProfile,
  LlamaCppIterationProfile,
  GapStats,
  TaskKind,
  TaskPhase,
  TaskSet,
  TaskSubset,
  TaskOrder,
  TaskItemListRef,
  TaskSessionRecord,
  TaskDriverRecord,
  TaskComponentEntry,
  TaskComponentsCapture,
  TaskOnDeviceInternalsCapture,
  TaskStartEnd,
  TaskDownloadRecord,
  TaskCellRecord,
  TaskDetectCandidate,
  TaskIteration,
} from './types.js';

// Task sessions (the chrome-ai-tasks control kind, TASKS_PROTOCOL_VERSION)
export {
  TASK_KINDS,
  TASK_PHASES,
  TASK_SETS,
  TASK_SUBSETS,
  TASK_ORDERS,
  TASK_RUNTIMES,
  TASK_ITEM_WATCHDOG_MS,
  TASK_PRESSURE_GATE_MS,
  TASK_DETECT_MAX_CANDIDATES,
  TASK_TEXT_MAX_CHARS,
  TASK_CAPTURE_MAX_CHARS,
  TASK_LIST_MAX_ITEMS,
  taskArmId,
  taskSystemOrder,
  taskRuntimeOrder,
  controlTasksError,
  taskCellError,
  taskCellOrderError,
  taskLimitError,
} from './tasks/protocol.js';
export { sha256HexSync } from './tasks/sha256.js';
export { runTaskSession, TaskPreflightError } from './tasks/session.js';
export type {
  TaskItem,
  TaskPlannedCell,
  TaskItemOutput,
  LoadedTaskSystem,
  TaskSystemAdapter,
  TaskFinalizeCaptures,
  TaskSessionHooks,
  TaskSessionOptions,
} from './tasks/session.js';

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
  CONTROL_KINDS,
  CONTROL_WASM_DTYPE,
  CONTROL_WASM_LANE_SPECS,
  CONTROL_WASM_MAX_THREADS,
  controlRuntimeOrder,
  controlWasmLaneError,
  controlWllamaBuildError,
  CONTROL_WLLAMA_BUILDS,
  createHarnessControl,
  WLLAMA_BUILDS,
  wllamaBuildError,
  CONTROL_CURRENT_RELEASE_PACKAGES,
  CONTROL_CURRENT_RELEASE_OPTIONAL_PACKAGES,
  CURRENT_RELEASE_LANE_PACKAGES,
  controlRuntimeVersionsError,
  runtimeVersionCellError,
  CONTROL_PROFILE_SPECS,
  PROFILE_MAX_OPERATOR_ROWS,
  PROFILE_MAX_ITERATIONS,
  LLAMACPP_PROFILE_BIN_EDGES_MS,
  cellProfileError,
  summarizeGaps,
  isControlRun,
} from './protocol.js';
export type { RunPolicy, CreateHarnessControlOptions, ControlWasmLaneSpec } from './protocol.js';

// Adapters
export type {
  BenchStreamChunk,
  BenchLanguageModel,
  BenchEmbeddingModel,
  AdapterAvailability,
  AdapterLoadProgress,
  LoadedLLM,
  LoadedEmbedder,
  BenchCellProfiler,
  BenchProfileCollection,
  LLMRuntimeAdapter,
  EmbeddingRuntimeAdapter,
} from './adapter.js';
export { USAGE_FIDELITY } from './adapter.js';

// Runner
export { runBenchmarkSuite } from './runner.js';
export type { PlannedCell, RunnerActivity, RunnerHooks, RunSuiteOptions } from './runner.js';

// Environment + measurement
export {
  captureEnvironment,
  parseUserAgent,
  detectEngine,
  deriveDeviceType,
  parseGpuModel,
  resolveGpuModel,
  detectWasmFeatures,
  coarseBatteryLevel,
} from './env.js';
export type { DeviceTypeSignals } from './env.js';
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
  SERIES_MAX_COOLDOWN_MS,
  SERIES_MAX_IDLE_BEFORE_MS,
  REPORTED_GPU_MAX_LENGTH,
  REPORTED_RAM_MAX_GB,
  offloadReportError,
  liteRtLoadReportError,
} from './validate.js';
export type { ValidateOptions } from './validate.js';
export { canonicalJson, sha256Hex, computeRunDigest, computeLegacyRunDigest, verifyRunDigest } from './canonical.js';

// Publication scrub (what a public run file may carry)
export { scrubRunForPublication, sanitizeReportedGpu } from './publication.js';
export type { PublicationScrub } from './publication.js';

// Aggregation (leaderboard + analysis tooling)
export {
  aggregateRuns,
  aggregateRunsWithErrata,
  amdArchitectureFromRenderer,
  AMD_DEVICE_ID_ARCHITECTURE,
  deviceClassOf,
  gpuArchitectureOf,
  deviceSubclassOf,
  refineDeviceClass,
  rowsToCSV,
  runsToLongCSV,
  runsToCellsCSV,
  runsToRunsCSV,
  runtimeVersionColumn,
  HEADLINE_MIN_SUBMISSIONS,
} from './aggregate.js';
export type { AggregateResult, LeaderboardRow } from './aggregate.js';

// Per-cell errata (exclusions with a stated reason, never re-scores)
export { ERRATA_FILE, errataExclusions, validateErrata, validateErrataShape } from './errata.js';
export type { ErrataExclusions, ErrataRunRef, ErrataTally, ErratumEntry } from './errata.js';
export { pressureStateFractions } from './pressure.js';
export type { PressureState, PressureStateSummary } from './pressure.js';

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
