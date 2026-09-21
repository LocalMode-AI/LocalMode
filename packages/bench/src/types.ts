/**
 * Protocol types for the LocalMode LocalMode Bench — the cross-runtime in-browser
 * AI benchmark. A `BenchRunResult` is the unit of submission: it carries raw
 * per-chunk timing traces (never just client-computed aggregates) so that all
 * published statistics can be recomputed and audited server-side.
 */

/** Protocol identifier embedded in every result. Bump only with a spec change. */
export const BENCH_PROTOCOL_VERSION = 'localmode-bench/4';

/** Result JSON schema version (independent of the protocol semantics version). */
export const BENCH_SCHEMA_VERSION = 3;

/** Schema versions a submission may carry: the current one and the one a page built before the last schema change still sends. */
export const ACCEPTED_SCHEMA_VERSIONS: readonly number[] = [2, 3];

/** Benchmark suite presets. `custom` = user-picked cells. */
export type BenchSuiteId = 'quick' | 'standard' | 'thorough' | 'custom';

/**
 * A benchmark runtime lane. Transformers.js is split into two lanes because
 * WebGPU vs WASM is the core comparison axis.
 */
export type BenchRuntimeId =
  | 'transformers-webgpu'
  | 'transformers-wasm'
  | 'webllm'
  /** llama.cpp WASM on the CPU (`n_gpu_layers: 0`); before protocol v3 this lane silently ran on WebGPU where available. */
  | 'wllama'
  /** llama.cpp WASM with every layer offloaded to WebGPU. */
  | 'wllama-webgpu'
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
  /**
   * Appended to the quality-lane instruction line for every runtime of this
   * pairing (e.g. " /no_think" to hold Qwen3 in non-thinking mode). Uniform
   * across runtimes by construction, so fidelity comparisons stay valid.
   */
  qualityPromptSuffix?: string;
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
  /** Bytes at the moment a cell errored (load or workload failure). */
  atError?: number;
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
  /**
   * Raw model outputs per item (MMLU lanes; capped at 400 chars each) so the
   * score is recomputable server-side and parse failures are auditable.
   */
  outputs?: string[];
  /** Fraction of items whose answer was parseable (MMLU lanes). */
  parseRate?: number;
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
  /**
   * Runtime configuration the adapter reports once the model is loaded
   * (thread count, GPU layers requested and llama.cpp's offload report,
   * dtype, ...): the equal-care record for the lane, per cell.
   */
  runtimeConfig?: Record<string, string | number | boolean>;
  load: LoadRecord | null;
  /** Untimed warmup duration (ms), when a warmup ran. */
  warmupMs?: number;
  iterations: LLMIteration[] | EmbedIteration[];
  /**
   * Timed iterations the tab was hidden during, kept with their gates for
   * auditability and repeated once the tab was visible again; never scored.
   */
  discardedIterations?: Array<LLMIteration | EmbedIteration>;
  memory?: MemorySample;
  quality?: QualityResult;
  status: BenchCellStatus;
  invalidReasons?: string[];
  /**
   * Failed attempts that preceded the recorded outcome (a watchdog timeout, a
   * provider error), oldest first. The runner retries a cell up to the
   * policy's `maxAttempts`; nothing is retried silently.
   */
  attempts?: Array<{ error: NonNullable<BenchCellResult['error']>; at: number }>;
  /** Error that ended the cell; `cause` carries the wrapped provider error's message when present. */
  error?: {
    name: string;
    message: string;
    /** Message of the wrapped provider error, when the thrown error carried a `cause`. */
    cause?: string;
    /** `name` of the wrapped provider error (e.g. wllama's `RuntimeError` for a WASM abort). */
    causeName?: string;
    /** Stack of the wrapped provider error, capped at 4,000 characters; a WASM abort names its frame only here. */
    causeStack?: string;
  };
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
    | 'cell-timeout'
    | 'cell-retry'
    | 'iteration-redo'
    | 'abort';
  detail?: string;
}

/** Browser identification with its provenance. */
export interface BrowserInfo {
  name: string;
  version: string;
  source: 'ua-ch' | 'ua-parse';
  brands?: Array<{ brand: string; version: string }>;
  /** Rendering engine, derived from the UA (Blink / Gecko / WebKit). */
  engine?: 'Blink' | 'Gecko' | 'WebKit' | 'unknown';
  /** `navigator.vendor` (e.g. "Google Inc.", "Apple Computer, Inc."). */
  vendor?: string;
  /** `navigator.webdriver` — true under browser automation. */
  webdriver?: boolean;
  /** `navigator.pdfViewerEnabled`, a cheap headless/kiosk signal. */
  pdfViewerEnabled?: boolean;
}

/** OS identification. Version is 'unknown-frozen' on engines with frozen UAs. */
export interface OSInfo {
  platform: string;
  version: string;
  architecture?: string;
  bitness?: string;
  /** Device model from UA-CH (Android only; empty elsewhere by spec). */
  model?: string;
  /** Whether the OS is running in a WoW64-style emulation layer (UA-CH `wow64`). */
  wow64?: boolean;
  /** `navigator.platform` (legacy, frozen but still informative: "MacIntel", "Win32", "iPhone"). */
  navigatorPlatform?: string;
}

/** Form-factor classification, derived from UA-CH form factors, the UA, and touch. */
export type DeviceType = 'phone' | 'tablet' | 'desktop' | 'xr' | 'tv' | 'unknown';

/** Device / form-factor signals. */
export interface DeviceInfo {
  type: DeviceType;
  /** UA-CH `mobile` bit (Chromium) or a UA-derived guess elsewhere. */
  mobile: boolean;
  /** UA-CH `formFactors` (Chromium 125+): Desktop / Mobile / Tablet / XR / EInk / Watch / Automotive. */
  formFactors?: string[];
  /** `navigator.maxTouchPoints`. */
  maxTouchPoints: number;
  /** `(pointer: coarse)` media query — primary input is a touch surface. */
  pointerCoarse?: boolean;
  /** `(hover: none)` media query — no hover-capable primary input. */
  hoverNone?: boolean;
  /** Standalone / fullscreen display mode (installed PWA or kiosk). */
  displayMode?: string;
}

/** WebGPU adapter identity + selected limits (all fields may be empty strings). */
export interface GPUInfo {
  available: boolean;
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
  /** Adapter-reported subgroup sizes (Chromium 130+ `info.subgroupMinSize/MaxSize`). */
  subgroupMinSize?: number;
  subgroupMaxSize?: number;
  isFallbackAdapter?: boolean;
  features?: string[];
  limits?: Record<string, number>;
  /** `navigator.gpu.getPreferredCanvasFormat()`. */
  preferredCanvasFormat?: string;
  /** WGSL language features the implementation reports (`navigator.gpu.wgslLanguageFeatures`). */
  wgslLanguageFeatures?: string[];
}

/** WebGL identity + capacity signals (a second, older GPU identity channel). */
export interface WebGLInfo {
  /** Best context available: 'webgl2', 'webgl', or null when neither creates. */
  contextKind: 'webgl2' | 'webgl' | null;
  /** UNMASKED_VENDOR_WEBGL when the debug extension exists, else VENDOR. */
  vendor?: string;
  /** UNMASKED_RENDERER_WEBGL when the debug extension exists, else RENDERER. */
  renderer?: string;
  version?: string;
  shadingLanguageVersion?: string;
  maxTextureSize?: number;
  maxRenderbufferSize?: number;
  maxVertexUniformVectors?: number;
  maxFragmentUniformVectors?: number;
  /** Number of extensions exposed (identity signal without shipping the whole list). */
  extensionCount?: number;
  /** Whether the renderer string names a software rasterizer (SwiftShader, llvmpipe, ...). */
  softwareRenderer?: boolean;
}

/**
 * WebAssembly proposal support, each probed by validating a canonical module
 * (the same byte sequences `wasm-feature-detect` uses). Missing keys mean the
 * probe itself failed, not that the feature is absent.
 */
export interface WasmFeatureSupport {
  simd: boolean;
  relaxedSimd: boolean;
  threads: boolean;
  bulkMemory: boolean;
  exceptions: boolean;
  /** Exception handling with `exnref` (the newer, standardized form). */
  exceptionsFinal: boolean;
  extendedConst: boolean;
  gc: boolean;
  memory64: boolean;
  multiMemory: boolean;
  multiValue: boolean;
  mutableGlobals: boolean;
  referenceTypes: boolean;
  saturatedFloatToInt: boolean;
  signExtensions: boolean;
  tailCall: boolean;
  typedFunctionReferences: boolean;
  /** 128-bit wide arithmetic (`i64.add128` family). */
  wideArithmetic: boolean;
  /** JavaScript Promise Integration (`WebAssembly.Suspending`). */
  jspi: boolean;
  /** Type reflection (`WebAssembly.Function`). */
  typeReflection: boolean;
  /** `WebAssembly.compileStreaming` exists. */
  streamingCompilation: boolean;
  /** JS String Builtins (`js-string` import module), probed via the imports/builtins option. */
  jsStringBuiltins: boolean;
  /** Type-level `WebAssembly.Memory` growth limit reachable in this engine (pages of 64 KiB). */
  maxMemoryPages?: number;
}

/**
 * Availability of the browser APIs the runtimes and the analysis care about.
 * Each entry is a plain presence check (the feature exists on this page),
 * not a functional test. Chrome Built-in AI is reported by its
 * `availability()` string where the API exists.
 */
export interface APIAvailability {
  webgpu: boolean;
  webgl2: boolean;
  webnn: boolean;
  /** OPFS: `navigator.storage.getDirectory` exists AND resolved. */
  opfs: boolean;
  /** Result of `navigator.storage.persisted()` where supported. */
  persistedStorage?: boolean;
  indexedDB: boolean;
  cacheApi: boolean;
  serviceWorker: boolean;
  webWorkers: boolean;
  offscreenCanvas: boolean;
  webLocks: boolean;
  broadcastChannel: boolean;
  wakeLock: boolean;
  computePressure: boolean;
  performanceMemory: boolean;
  measureUserAgentSpecificMemory: boolean;
  schedulerYield: boolean;
  webCodecs: boolean;
  audioWorklet: boolean;
  mediaDevices: boolean;
  webTransport: boolean;
  /** Chrome Built-in AI (Gemini Nano) surfaces, by `availability()` verdict when reachable. */
  promptApi?: string;
  summarizerApi?: string;
  translatorApi?: string;
  languageDetectorApi?: string;
}

/** Network Information API (Chromium + Android) snapshot at capture time. */
export interface NetworkInfo {
  supported: boolean;
  effectiveType?: string;
  /** Connection type (wifi / cellular / ethernet / ...) where the UA exposes it. */
  type?: string;
  downlinkMbps?: number;
  rttMs?: number;
  saveData?: boolean;
  online?: boolean;
}

/** Display / viewport snapshot. */
export interface DisplayInfo {
  width: number;
  height: number;
  availWidth?: number;
  availHeight?: number;
  dpr: number;
  colorDepth?: number;
  orientation?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  /** `(dynamic-range: high)` media query. */
  hdr?: boolean;
  /** `(color-gamut: p3)` media query. */
  wideGamut?: boolean;
  /** `screen.isExtended` (Window Management API) — more than one display attached. */
  isExtended?: boolean;
}

/**
 * Locale signal: the BCP 47 tag only (`en-US`). The time zone, UTC offset,
 * and calendar a page can also read place a device in a city, which a public
 * dataset has no use for, so they are not captured (schema 3).
 */
export interface LocaleInfo {
  locale?: string;
}

/**
 * Full environment capture for a run. Every field beyond the first block is
 * additive and best-effort: a probe that fails records nothing for its key and
 * never affects the others. Clamped or capped fields are labeled as such.
 */
export interface EnvironmentCapture {
  capturedAt: string;
  browser: BrowserInfo;
  os: OSInfo;
  hardware: {
    /** navigator.hardwareConcurrency — WebKit clamps it (8 on macOS, 4 on iOS); Chromium and Firefox report the real count. */
    cores: number | null;
    coresClamped: boolean;
    /** navigator.deviceMemory (GB) — Chromium-only, capped at 8. */
    deviceMemoryGB: number | null;
    deviceMemoryCapped: boolean;
    /** `performance.memory.jsHeapSizeLimit` (Chromium) — the V8 heap ceiling for this tab. */
    jsHeapSizeLimitBytes?: number;
    /** `performance.memory.usedJSHeapSize` at capture (the idle baseline). */
    jsHeapUsedBytes?: number;
  };
  gpu: GPUInfo;
  /** WebGL renderer string, a secondary GPU identity signal. */
  webglRenderer: string | null;
  /** Detailed WebGL identity + capacity (superset of `webglRenderer`). */
  webgl?: WebGLInfo;
  /**
   * GPU model parsed from the WebGL renderer string (ANGLE unwrapped),
   * e.g. "Apple M4", "NVIDIA GeForce RTX 4070", "Mali-G78 MP20". Absent when
   * no WebGL context could be created.
   */
  gpuModel?: string;
  flags: {
    crossOriginIsolated: boolean;
    sharedArrayBuffer: boolean;
    wasmSimd: boolean;
    /** `window.isSecureContext`. */
    secureContext?: boolean;
    /** Full WebAssembly proposal matrix (superset of `wasmSimd`). */
    wasm?: WasmFeatureSupport;
  };
  /** Presence checks for the APIs the runtimes depend on. */
  apis?: APIAvailability;
  device?: DeviceInfo;
  storage: { quotaBytes?: number; usageBytes?: number; usageDetails?: Record<string, number> } | null;
  power: {
    batterySupported: boolean;
    charging?: boolean;
    /**
     * Battery level rounded to a quarter (0, 0.25, 0.5, 0.75, 1). Low levels
     * bring power saving, which matters; the exact percentage would track a
     * device across runs and is not kept (schema 3).
     */
    level?: number;
  };
  pressure: { supported: boolean; lastState?: string };
  /** Inferred performance.now() quantum in microseconds (grid inference). */
  timerResolutionUs: number | null;
  screen: { width: number; height: number; dpr: number } | null;
  /** Detailed display snapshot (superset of `screen`). */
  display?: DisplayInfo;
  network?: NetworkInfo;
  locale?: LocaleInfo;
  /** Raw `navigator.userAgent` — kept verbatim so future parsers can re-derive fields. */
  userAgent?: string;
  /** Page origin the run executed on (distinguishes production from local/staging). */
  pageOrigin?: string;
  /** `document.visibilityState` at capture; a hidden tab is throttled. */
  visibilityState?: string;
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
  /** Request wall time (startT → endT), all LLM lanes. */
  totalMs?: MetricSummary;
  /** End-to-end chars/s over the whole request (prefill + decode conflated). */
  overallCharsPerSec?: MetricSummary;
  /**
   * False when the chunk trace is not genuinely incremental (single chunk, or
   * the visible stream spans <20% of the request) — TTFT and decode metrics
   * are then omitted because they would be timing artifacts, not measurements.
   */
  streamIncremental?: boolean;
  /** Embedding lanes. */
  singleLatencyMs?: MetricSummary;
  batchTextsPerSec?: MetricSummary;
  /** Load phase. */
  loadMs?: number;
  loadCached?: boolean;
  qualityScore?: number;
  /** Fraction of MMLU items whose answer parsed; a low value marks a format failure, not a fidelity one. */
  qualityParseRate?: number;
  highVariance: boolean;
}

/** Identity of the software that produced a run. */
export interface HarnessInfo {
  name: string;
  version: string;
  appVersion?: string;
  /**
   * Versions of the runtime packages bundled into the harness at build time
   * (e.g. `{ "@huggingface/transformers": "4.2.0", "@wllama/wllama": "3.5.1" }`),
   * keyed by npm package name. Per-cell `runtimeVersion` names the same value
   * for the runtime that produced that cell.
   */
  runtimeVersions?: Record<string, string>;
  /** Git commit of the harness build where the host exposes it. */
  commit?: string;
}

/** The unit of submission: one full suite run on one device. */
export interface BenchRunResult {
  protocol: typeof BENCH_PROTOCOL_VERSION;
  schemaVersion: typeof BENCH_SCHEMA_VERSION;
  runId: string;
  createdAt: string;
  harness: HarnessInfo;
  suite: BenchSuiteId;
  environment: EnvironmentCapture;
  fingerprint: FingerprintResult | null;
  cells: BenchCellResult[];
  events: TraceEvent[];
  /** Client-computed summaries (advisory; server recomputes from the trace). */
  clientSummaries?: CellSummary[];
  /**
   * Server-issued anti-forgery nonce (verified tier only). Present on the
   * submission, never in the published file: the server strips it.
   */
  nonce?: string;
  /** SHA-256 of the canonical JSON of this object without `digest` and `nonce`. */
  digest?: string;
  /**
   * ISO time at which the published file was rewritten by the publication
   * scrub (fields removed under a later schema, digest recomputed); absent
   * when the file is exactly what the client submitted.
   */
  scrubbedAt?: string;
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
