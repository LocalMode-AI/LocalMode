/**
 * Protocol types for the LocalMode LocalMode Bench — the cross-runtime in-browser
 * AI benchmark. A `BenchRunResult` is the unit of submission: it carries raw
 * per-chunk timing traces (never just client-computed aggregates) so that all
 * published statistics can be recomputed and audited server-side.
 */

/** Protocol identifier embedded in every result. Bump only with a spec change. */
export const BENCH_PROTOCOL_VERSION = 'localmode-bench/1';

/** Result JSON schema version (independent of the protocol semantics version). */
export const BENCH_SCHEMA_VERSION = 1;

/** Benchmark suite presets. `custom` = user-picked cells. */
export type BenchSuiteId = 'quick' | 'standard' | 'thorough' | 'custom';

/**
 * A benchmark runtime lane. Transformers.js is split into two lanes because
 * WebGPU vs WASM is the paper's core comparison axis.
 */
export type BenchRuntimeId =
  | 'transformers-webgpu'
  | 'transformers-wasm'
  | 'webllm'
  | 'wllama'
  | 'litert'
  | 'chrome-ai'
  | 'mediapipe';

/** Workload kinds. Quality lanes are separate from timed performance lanes. */
export type BenchWorkloadKind =
  | 'llm-generate'
  | 'embed-single'
  | 'embed-batch'
  | 'quality-mmlu'
  | 'quality-sts';

/** A fixed LLM generation workload (public prompt, deterministic settings). */
export interface LLMWorkloadSpec {
  id: string;
  kind: 'llm-generate';
  /** Human-readable label, e.g. "Chat pp128/tg128". */
  label: string;
  prompt: string;
  systemPrompt?: string;
  /**
   * Approximate prompt token count (reference estimate; exact counts are
   * tokenizer-specific and computed post-hoc from the stored prompt).
   */
  approxPromptTokens: number;
  /** Generation budget. Decode metrics use the actual generated length. */
  maxTokens: number;
  /** Always 0 for performance runs (deterministic where the runtime allows). */
  temperature: number;
}

/** A fixed embedding workload over deterministic public texts. */
export interface EmbedWorkloadSpec {
  id: string;
  kind: 'embed-single' | 'embed-batch';
  label: string;
  /** Fixed input texts. Length 1 for single-latency, N for batch throughput. */
  texts: string[];
}

/** Quality-fidelity workloads (temp 0, scored, untimed-region rules relaxed). */
export interface QualityWorkloadSpec {
  id: string;
  kind: 'quality-mmlu' | 'quality-sts';
  label: string;
  /** Number of items to evaluate (subset of the bundled dataset). */
  items: number;
}

export type BenchWorkloadSpec = LLMWorkloadSpec | EmbedWorkloadSpec | QualityWorkloadSpec;

/** Static reference to a model as benchmarked in one runtime lane. */
export interface BenchModelRef {
  /** Cross-runtime pairing id, e.g. "qwen3-0.6b" — same weights family. */
  benchModelId: string;
  runtimeId: BenchRuntimeId;
  /** The provider-native model id passed to the runtime. */
  providerModelId: string;
  displayName: string;
  /** "llm" or "embedding". */
  task: 'llm' | 'embedding';
  parameterCount?: string;
  quantization?: string;
  sizeBytes?: number;
  contextLength?: number;
  /** Direct model URL when applicable (wllama GGUF, litert). */
  url?: string;
  requiresWebGPU?: boolean;
}

/** One recorded stream chunk: wall-clock timestamp + delta length in chars. */
export interface BenchChunk {
  /** `performance.now()` at chunk receipt (ms, page-relative). */
  t: number;
  /** Character length of this chunk's text delta. */
  c: number;
}

/** Provider-reported usage, recorded as auxiliary data (often estimated). */
export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number;
  /** How trustworthy the provider counts are for this runtime. */
  fidelity: 'measured' | 'estimated' | 'chunk-count';
}

/** One timed LLM generation iteration with its raw trace. */
export interface LLMIteration {
  /** `performance.now()` just before the stream is requested. */
  startT: number;
  /** Per-chunk receipt trace. TTFT derives from the first entry with c > 0. */
  chunks: BenchChunk[];
  /** `performance.now()` after the terminal chunk. */
  endT: number;
  /** Full generated text (enables post-hoc exact tokenization + auditing). */
  text: string;
  providerUsage?: ProviderUsage;
  finishReason?: string;
  /** Validity-gate events that fired during this iteration (empty = valid). */
  gates: string[];
}

/** One timed embedding iteration. */
export interface EmbedIteration {
  startT: number;
  endT: number;
  /** Number of texts embedded in this iteration. */
  count: number;
  /** Embedding dimensions reported by the model. */
  dimensions: number;
  gates: string[];
}

/** Model-load phase record for a cell (null when the cell reused a live model). */
export interface LoadRecord {
  /** Provider cache probe before load: true=warm, false=cold, undefined=unknown. */
  cached: boolean | undefined;
  startT: number;
  endT: number;
  /** Progress milestones (coarse, at most ~50 samples). */
  progress?: Array<{ t: number; pct: number }>;
  /** Catalog-declared download size, when known. */
  declaredBytes?: number;
}

/** Memory sampling at protocol points (Chromium-only APIs; absent elsewhere). */
export interface MemorySample {
  /** Bytes reported at suite baseline, after load, after timed runs. */
  baseline?: number;
  postLoad?: number;
  postRun?: number;
  api: 'uaSpecific' | 'legacyHeap' | 'none';
}

/** Quality lane outcome attached to a cell. */
export interface QualityResult {
  taskId: string;
  /** Primary score: accuracy (MMLU) or Spearman rho (STS). */
  score: number;
  n: number;
  /** Per-item correctness or per-pair cosine, for auditability. */
  details?: number[];
}

export type BenchCellStatus = 'ok' | 'invalid' | 'error' | 'skipped';

/** One benchmark cell: (runtime x model x workload) with its raw iterations. */
export interface BenchCellResult {
  /** `${runtimeId}/${benchModelId}/${workloadId}` */
  cellId: string;
  runtimeId: BenchRuntimeId;
  runtimeVersion?: string;
  model: BenchModelRef;
  workloadId: string;
  workloadKind: BenchWorkloadKind;
  /** Backend actually used (probed, never the requested one). */
  resolvedBackend: string;
  load: LoadRecord | null;
  /** Untimed warmup duration (ms), when a warmup ran. */
  warmupMs?: number;
  iterations: LLMIteration[] | EmbedIteration[];
  memory?: MemorySample;
  quality?: QualityResult;
  status: BenchCellStatus;
  invalidReasons?: string[];
  error?: { name: string; message: string };
}

/** Trace events global to the suite run (validity accounting). */
export interface TraceEvent {
  t: number;
  type:
    | 'suite-start'
    | 'suite-end'
    | 'visibility-hidden'
    | 'visibility-visible'
    | 'wakelock-acquired'
    | 'wakelock-released'
    | 'pressure-change'
    | 'gpu-device-lost'
    | 'cooldown-start'
    | 'cooldown-end'
    | 'abort';
  detail?: string;
}

/** Browser identification with its provenance. */
export interface BrowserInfo {
  name: string;
  version: string;
  source: 'ua-ch' | 'ua-parse';
  brands?: Array<{ brand: string; version: string }>;
}

/** OS identification. Version is 'unknown-frozen' on engines with frozen UAs. */
export interface OSInfo {
  platform: string;
  version: string;
  architecture?: string;
  bitness?: string;
  model?: string;
}

/** WebGPU adapter identity + selected limits (all fields may be empty strings). */
export interface GPUInfo {
  available: boolean;
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
  isFallbackAdapter?: boolean;
  features?: string[];
  limits?: Record<string, number>;
}

/** Full environment capture for a run. Clamped fields are labeled as such. */
export interface EnvironmentCapture {
  capturedAt: string;
  browser: BrowserInfo;
  os: OSInfo;
  hardware: {
    /** navigator.hardwareConcurrency — clamped/randomized on Gecko/WebKit. */
    cores: number | null;
    coresClamped: boolean;
    /** navigator.deviceMemory (GB) — Chromium-only, capped at 8. */
    deviceMemoryGB: number | null;
    deviceMemoryCapped: boolean;
  };
  gpu: GPUInfo;
  /** WebGL renderer string, a secondary GPU identity signal. */
  webglRenderer: string | null;
  flags: {
    crossOriginIsolated: boolean;
    sharedArrayBuffer: boolean;
    wasmSimd: boolean;
  };
  storage: { quotaBytes?: number; usageBytes?: number } | null;
  power: { batterySupported: boolean; charging?: boolean; level?: number };
  pressure: { supported: boolean; lastState?: string };
  /** Inferred performance.now() quantum in microseconds (grid inference). */
  timerResolutionUs: number | null;
  screen: { width: number; height: number; dpr: number } | null;
  languages?: string[];
  /** Free-text device self-report — displayed as "user-reported", never trusted. */
  userReportedDevice?: string;
}

/** Deterministic JS matmul microbenchmark result (hardware fingerprint). */
export interface FingerprintResult {
  /** Millions of fused multiply-adds per second. */
  mflops: number;
  n: number;
  iterations: number;
  durationMs: number;
  /** Checksum of the final matrix — proves the work actually ran. */
  checksum: number;
}

/** Statistical summary of one metric across iterations. */
export interface MetricSummary {
  n: number;
  median: number;
  mean: number;
  sd: number;
  iqr: number;
  min: number;
  max: number;
  /** 95% confidence interval half-width (Student-t). */
  ci95: number;
  /** Coefficient of variation (sd/mean), 0 when mean is 0. */
  cv: number;
}

/** Derived per-cell summary (recomputable from the raw trace by anyone). */
export interface CellSummary {
  cellId: string;
  status: BenchCellStatus;
  /** LLM lanes. */
  ttftMs?: MetricSummary;
  decodeCharsPerSec?: MetricSummary;
  decodeChunksPerSec?: MetricSummary;
  prefillTokPerSecApprox?: MetricSummary;
  generatedChars?: MetricSummary;
  /** Embedding lanes. */
  singleLatencyMs?: MetricSummary;
  batchTextsPerSec?: MetricSummary;
  /** Load phase. */
  loadMs?: number;
  loadCached?: boolean;
  qualityScore?: number;
  highVariance: boolean;
}

/** The unit of submission: one full suite run on one device. */
export interface BenchRunResult {
  protocol: typeof BENCH_PROTOCOL_VERSION;
  schemaVersion: typeof BENCH_SCHEMA_VERSION;
  runId: string;
  createdAt: string;
  harness: { name: string; version: string; appVersion?: string };
  suite: BenchSuiteId;
  environment: EnvironmentCapture;
  fingerprint: FingerprintResult | null;
  cells: BenchCellResult[];
  events: TraceEvent[];
  /** Client-computed summaries (advisory; server recomputes from the trace). */
  clientSummaries?: CellSummary[];
  /** Server-issued anti-forgery nonce (verified tier only). */
  nonce?: string;
  /** SHA-256 of the canonical JSON of this object without `digest`. */
  digest?: string;
}

/** A plausibility/integrity finding attached by validation. */
export interface PlausibilityFlag {
  code: string;
  cellId?: string;
  message: string;
  severity: 'warn' | 'reject';
}

/** Outcome of full validation (shape + recompute + plausibility). */
export interface ValidationReport {
  ok: boolean;
  shapeErrors: string[];
  flags: PlausibilityFlag[];
  summaries: CellSummary[];
}
