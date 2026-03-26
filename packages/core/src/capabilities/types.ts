/**
 * Capability Detection Types
 *
 * Type definitions for device capability detection and feature support.
 *
 * @packageDocumentation
 */

// ============================================================================
// Device Capabilities
// ============================================================================

/**
 * Comprehensive device and browser capabilities.
 */
export interface DeviceCapabilities {
  /** Browser information */
  browser: {
    name: string;
    version: string;
    engine: string;
  };

  /** Device information */
  device: {
    type: 'desktop' | 'mobile' | 'tablet' | 'unknown';
    os: string;
    osVersion: string;
  };

  /** Hardware information */
  hardware: {
    /** Number of logical CPU cores */
    cores: number;
    /** Device memory in GB (if available) */
    memory?: number;
    /** GPU info (if available) */
    gpu?: string;
  };

  /** Feature availability */
  features: {
    webgpu: boolean;
    webnn: boolean;
    wasm: boolean;
    simd: boolean;
    threads: boolean;
    indexeddb: boolean;
    opfs: boolean;
    webworkers: boolean;
    sharedarraybuffer: boolean;
    crossOriginisolated: boolean;
    serviceworker: boolean;
    broadcastchannel: boolean;
    weblocks: boolean;
    chromeAI: boolean;
    chromeAISummarizer: boolean;
    chromeAITranslator: boolean;
  };

  /** Storage information */
  storage: {
    quotaBytes: number;
    usedBytes: number;
    availableBytes: number;
    isPersisted: boolean;
  };
}

// ============================================================================
// Feature Support
// ============================================================================

/**
 * Result of checking feature support.
 */
export interface FeatureSupportResult {
  /** Whether the feature is supported */
  supported: boolean;

  /** Reason for lack of support (if not supported) */
  reason?: string;

  /** Recommended fallbacks */
  fallbacks?: FallbackRecommendation[];

  /** Browser recommendations for this feature */
  browserRecommendations?: BrowserRecommendation[];
}

/**
 * Fallback recommendation when a feature is not supported.
 */
export interface FallbackRecommendation {
  /** Feature this is a fallback for */
  feature: string;

  /** Alternative approach */
  alternative: string;

  /** Why this is recommended */
  reason: string;

  /** Tradeoffs of using this fallback */
  tradeoffs: string[];
}

/**
 * Browser recommendation for optimal support.
 */
export interface BrowserRecommendation {
  /** Browser name */
  browser: string;

  /** Minimum version required */
  minVersion: string;

  /** Features supported */
  features: string[];

  /** Additional notes */
  note?: string;
}

// ============================================================================
// Model Support
// ============================================================================

/**
 * Result of checking model support.
 */
export interface ModelSupportResult {
  /** Whether the model can run on this device */
  supported: boolean;

  /** Reason for lack of support (if not supported) */
  reason?: string;

  /** Memory required by the model in bytes */
  memoryRequired: number;

  /** Available memory in bytes (if detectable) */
  memoryAvailable?: number;

  /** Storage required by the model in bytes */
  storageRequired: number;

  /** Available storage in bytes */
  storageAvailable: number;

  /** Recommended inference device */
  recommendedDevice: 'webgpu' | 'wasm' | 'cpu';

  /** Alternative models that would work better */
  fallbackModels?: ModelFallback[];

  /** Browser recommendations for this model */
  browserRecommendations?: BrowserRecommendation[];
}

/**
 * Model fallback recommendation.
 */
export interface ModelFallback {
  /** Model identifier */
  modelId: string;

  /** Why this is recommended */
  reason: string;

  /** Memory required in MB */
  memoryRequired: number;
}

/**
 * Model requirements for support checking.
 */
export interface ModelRequirements {
  /** Model identifier */
  modelId: string;

  /** Estimated memory requirement in bytes */
  estimatedMemory: number;

  /** Estimated storage requirement in bytes */
  estimatedStorage: number;

  /** Whether WebGPU is preferred */
  prefersWebGPU?: boolean;

  /** Minimum CPU cores recommended */
  minCores?: number;
}

// ============================================================================
// Capability Report
// ============================================================================

/**
 * Comprehensive capability report.
 */
export interface CapabilityReport {
  /** Timestamp of the report */
  timestamp: Date;

  /** Device capabilities */
  capabilities: DeviceCapabilities;

  /** Summary scores */
  scores: {
    /** Overall ML readiness (0-100) */
    mlReadiness: number;
    /** Storage capacity score (0-100) */
    storageCapacity: number;
    /** Performance potential (0-100) */
    performancePotential: number;
  };

  /** Key recommendations */
  recommendations: string[];

  /** Detected issues */
  issues: Array<{
    severity: 'error' | 'warning' | 'info';
    message: string;
    suggestion?: string;
  }>;
}

// ============================================================================
// Memory Information
// ============================================================================

/**
 * Memory information from the browser.
 */
export interface MemoryInfo {
  /** Total JS heap size in bytes (Chrome only) */
  totalJSHeapSize?: number;

  /** Used JS heap size in bytes (Chrome only) */
  usedJSHeapSize?: number;

  /** JS heap size limit in bytes (Chrome only) */
  jsHeapSizeLimit?: number;

  /** Device memory in GB (if available) */
  deviceMemory?: number;
}

/**
 * Device information.
 */
export interface DeviceInfo {
  /** User agent string */
  userAgent: string;

  /** Platform string */
  platform: string;

  /** Number of logical CPU cores */
  hardwareConcurrency: number;

  /** Device memory in GB (if available) */
  deviceMemory?: number;

  /** Maximum touch points (indicates touch device) */
  maxTouchPoints: number;
}

// ============================================================================
// Model Registry
// ============================================================================

/**
 * All supported ML task categories.
 *
 * Covers every domain that LocalMode providers can handle, from
 * text embeddings and classification to vision, audio, and generation.
 *
 * @example
 * ```typescript
 * import type { TaskCategory } from '@localmode/core';
 *
 * const task: TaskCategory = 'embedding';
 * ```
 */
export type TaskCategory =
  | 'embedding'
  | 'classification'
  | 'zero-shot'
  | 'ner'
  | 'reranking'
  | 'generation'
  | 'translation'
  | 'summarization'
  | 'fill-mask'
  | 'question-answering'
  | 'speech-to-text'
  | 'text-to-speech'
  | 'image-classification'
  | 'image-captioning'
  | 'object-detection'
  | 'segmentation'
  | 'ocr'
  | 'document-qa'
  | 'image-features'
  | 'image-to-image'
  | 'multimodal-embedding';

/**
 * A single entry in the model registry catalog.
 *
 * Each entry describes a model's metadata — its provider, task, size,
 * hardware requirements, and quality/speed characteristics. Entries do
 * not contain provider-specific configuration; they are provider-agnostic
 * metadata used by {@link recommendModels} for scoring and filtering.
 *
 * @example
 * ```typescript
 * import type { ModelRegistryEntry } from '@localmode/core';
 *
 * const entry: ModelRegistryEntry = {
 *   modelId: 'Xenova/bge-small-en-v1.5',
 *   provider: 'transformers',
 *   task: 'embedding',
 *   name: 'BGE Small EN v1.5',
 *   sizeMB: 33,
 *   dimensions: 384,
 *   recommendedDevice: 'wasm',
 *   speedTier: 'fast',
 *   qualityTier: 'medium',
 * };
 * ```
 */
export interface ModelRegistryEntry {
  /** Model identifier used to instantiate the model (e.g., `'Xenova/bge-small-en-v1.5'`) */
  readonly modelId: string;

  /** Provider package name (e.g., `'transformers'`, `'webllm'`, `'wllama'`, `'chrome-ai'`) */
  readonly provider: string;

  /** ML task this model performs */
  readonly task: TaskCategory;

  /** Human-readable display name */
  readonly name: string;

  /** Approximate download size in megabytes */
  readonly sizeMB: number;

  /** Minimum device memory recommended in megabytes (optional) */
  readonly minMemoryMB?: number;

  /** Output dimensions for embedding models (only relevant for `embedding` and `multimodal-embedding` tasks) */
  readonly dimensions?: number;

  /** Recommended inference device */
  readonly recommendedDevice: 'webgpu' | 'wasm' | 'cpu';

  /** Qualitative speed estimate */
  readonly speedTier: 'fast' | 'medium' | 'slow';

  /** Qualitative quality estimate based on published benchmarks */
  readonly qualityTier: 'low' | 'medium' | 'high';

  /** Optional short description */
  readonly description?: string;
}

/**
 * A ranked model recommendation returned by {@link recommendModels}.
 *
 * Contains the registry entry, a computed suitability score, and
 * human-readable reasons explaining the ranking.
 *
 * @example
 * ```typescript
 * import type { ModelRecommendation } from '@localmode/core';
 *
 * // Recommendations are sorted by score descending
 * const best: ModelRecommendation = recommendations[0];
 * console.log(best.entry.modelId, best.score, best.reasons);
 * ```
 */
export interface ModelRecommendation {
  /** The registry entry for this model */
  readonly entry: ModelRegistryEntry;

  /** Suitability score from 0 to 100 */
  readonly score: number;

  /** Human-readable reasons explaining the score */
  readonly reasons: string[];
}

/**
 * Options for filtering and ranking model recommendations.
 *
 * @example
 * ```typescript
 * import type { RecommendationOptions } from '@localmode/core';
 *
 * const options: RecommendationOptions = {
 *   task: 'embedding',
 *   maxSizeMB: 100,
 *   providers: ['transformers'],
 *   limit: 3,
 * };
 * ```
 */
export interface RecommendationOptions {
  /** Required task category to filter by */
  readonly task: TaskCategory;

  /** Optional maximum model download size in MB */
  readonly maxSizeMB?: number;

  /** Optional maximum memory requirement in MB */
  readonly maxMemoryMB?: number;

  /** Optional list of provider names to include (e.g., `['transformers', 'webllm']`) */
  readonly providers?: string[];

  /** Optional flag to only include models that recommend WebGPU */
  readonly requireWebGPU?: boolean;

  /** Maximum number of recommendations to return (default: 5) */
  readonly limit?: number;
}

// ============================================================================
// Adaptive Batch Size
// ============================================================================

/**
 * Task type for adaptive batch size computation.
 *
 * Determines the default base, min, and max batch sizes used by
 * {@link computeOptimalBatchSize}.
 *
 * - `'embedding'` — batch size for `streamEmbedMany()` (base: 32, min: 4, max: 256)
 * - `'ingestion'` — batch size for RAG `ingest()` (base: 64, min: 8, max: 512)
 */
export type BatchTaskType = 'embedding' | 'ingestion';

/**
 * Options for computing an optimal batch size based on device capabilities.
 *
 * @example
 * ```ts
 * import type { BatchSizeOptions } from '@localmode/core';
 *
 * const options: BatchSizeOptions = {
 *   taskType: 'embedding',
 *   modelDimensions: 384,
 *   deviceCapabilities: { cores: 8, memoryGB: 16, hasGPU: true },
 * };
 * ```
 *
 * @see {@link computeOptimalBatchSize}
 */
export interface BatchSizeOptions {
  /** The type of batch operation — determines default base/min/max batch sizes */
  taskType: BatchTaskType;

  /** The embedding model's output dimensions (used for reasoning, not directly in formula). Defaults to 0 if unknown. */
  modelDimensions?: number;

  /**
   * Optional overrides for device detection.
   * When provided, these values override browser API detection.
   * Partial overrides are merged with detected/fallback values.
   */
  deviceCapabilities?: {
    /** Number of logical CPU cores */
    cores?: number;
    /** Device memory in GB */
    memoryGB?: number;
    /** Whether a GPU is available */
    hasGPU?: boolean;
  };

  /** Optional minimum batch size floor (overrides task-type default) */
  minBatchSize?: number;

  /** Optional maximum batch size ceiling (overrides task-type default) */
  maxBatchSize?: number;

  /** Optional base batch size to override the task-type default */
  baseBatchSize?: number;
}

/**
 * Result of computing an optimal batch size.
 *
 * Contains the computed batch size, a human-readable explanation,
 * and the device profile used in the computation.
 *
 * @example
 * ```ts
 * import { computeOptimalBatchSize } from '@localmode/core';
 *
 * const result = computeOptimalBatchSize({
 *   taskType: 'embedding',
 *   modelDimensions: 384,
 * });
 *
 * console.log(result.batchSize);    // e.g., 32
 * console.log(result.reasoning);    // Human-readable explanation
 * console.log(result.deviceProfile); // { cores, memoryGB, hasGPU, source }
 * ```
 *
 * @see {@link computeOptimalBatchSize}
 */
export interface BatchSizeResult {
  /** The computed optimal batch size (always a positive integer) */
  batchSize: number;

  /** Human-readable explanation of how the batch size was computed */
  reasoning: string;

  /** The device capabilities used in the computation */
  deviceProfile: DeviceProfile;
}

/**
 * Device profile snapshot used in batch size computation.
 *
 * Captures the hardware values and their origin for observability.
 *
 * @example
 * ```ts
 * import type { DeviceProfile } from '@localmode/core';
 *
 * const profile: DeviceProfile = {
 *   cores: 8,
 *   memoryGB: 16,
 *   hasGPU: true,
 *   source: 'detected',
 * };
 * ```
 *
 * @see {@link BatchSizeResult}
 * @see {@link computeOptimalBatchSize}
 */
export interface DeviceProfile {
  /** Logical CPU cores used in computation */
  cores: number;

  /** Device memory in GB used in computation */
  memoryGB: number;

  /** Whether GPU was detected/provided */
  hasGPU: boolean;

  /**
   * Where the hardware values came from:
   * - `'detected'` — read from browser APIs (`navigator.hardwareConcurrency`, `navigator.deviceMemory`)
   * - `'override'` — caller provided `deviceCapabilities`
   * - `'fallback'` — `navigator` was undefined (SSR/Node.js), defaults used
   */
  source: 'detected' | 'override' | 'fallback';
}

