/**
 * LiteRT Model Constants
 *
 * Pre-defined model catalog for LiteRT (.litertlm) models curated for browser use.
 *
 * The LiteRT-LM JS API (`@litert-lm/core`) is an early preview that officially
 * supports a limited set of web-optimized `.litertlm` model files. The catalog
 * below tracks that support:
 *
 * - `gemma-4-E2B` / `gemma-4-E4B` — the two `*-it-web.litertlm` builds Google
 *   lists as officially supported by the JS API.
 * - `qwen3-0.6B` — a small general `.litertlm` file. Not on Google's official
 *   support list, but verified to load and generate end-to-end; kept as a
 *   lightweight sub-1GB option.
 *
 * Gated Google models (Gemma 3n, Gemma 3 1B, FunctionGemma) are intentionally
 * not listed — they require a HuggingFace login + Gemma license acceptance,
 * which a browser-side `fetch()` cannot perform. Load them with a custom
 * `modelUrl` (or a pre-fetched `ReadableStream<Uint8Array>`) instead.
 *
 * @packageDocumentation
 */

/**
 * Entry in the recommended LiteRT model catalog.
 */
export interface LiteRTModelEntry {
  /** Human-readable model name */
  name: string;

  /** Maximum context window in tokens */
  contextLength: number;

  /** File size in bytes */
  sizeBytes: number;

  /** Human-readable file size (e.g., '2.0GB') */
  size: string;

  /** Short description */
  description: string;

  /** HuggingFace download URL */
  url: string;

  /** Approximate parameter count */
  parameterCount: number;

  /**
   * Set to `true` when the model's `.litertlm` build is GPU-compiled and can
   * only run on the WebGPU backend (its TFLite sections carry a `gpu_artisan`
   * backend constraint). Such models cannot run on the CPU backend — the
   * provider fails fast with a clear error when WebGPU is unavailable.
   *
   * Optional — omitted (or `false`) for models that also run on CPU.
   */
  requiresWebGPU?: boolean;
}

/**
 * LiteRT models curated for browser use.
 *
 * These are quantized `.litertlm` models for on-device inference via Google's
 * LiteRT-LM engine. All URLs point to public HuggingFace repositories.
 */
export const LITERT_MODELS = {
  'gemma-4-E2B': {
    name: 'Gemma 4 E2B',
    contextLength: 8192,
    sizeBytes: 2_008_432_640, // 2.0 GB (verified on HF)
    size: '2.0GB',
    description:
      'Google Gemma 4 E2B — web-optimized .litertlm build. One of the two models officially supported by the LiteRT-LM JS API. WebGPU-only (GPU-compiled build).',
    url: 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm',
    parameterCount: 2_000_000_000,
    requiresWebGPU: true,
  },
  'gemma-4-E4B': {
    name: 'Gemma 4 E4B',
    contextLength: 8192,
    sizeBytes: 2_969_059_328, // 3.0 GB (verified on HF)
    size: '3.0GB',
    description:
      'Google Gemma 4 E4B — web-optimized .litertlm build, higher quality than E2B. One of the two models officially supported by the LiteRT-LM JS API. WebGPU-only (GPU-compiled build).',
    url: 'https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.litertlm',
    parameterCount: 4_000_000_000,
    requiresWebGPU: true,
  },
  'qwen3-0.6B': {
    name: 'Qwen3 0.6B',
    contextLength: 4096,
    sizeBytes: 614_236_160, // 614 MB (verified on HF)
    size: '614MB',
    description:
      'Alibaba Qwen3 0.6B — small, fast .litertlm model. Not part of the official LiteRT-LM JS API support list, but verified to load and generate end-to-end.',
    url: 'https://huggingface.co/litert-community/Qwen3-0.6B/resolve/main/Qwen3-0.6B.litertlm',
    parameterCount: 600_000_000,
  },
} as const;

/** Size thresholds for model categories (in bytes) */
export const MODEL_SIZE_THRESHOLDS = {
  tiny: 500 * 1024 * 1024, // < 500MB
  small: 1024 * 1024 * 1024, // 500MB - 1GB
  medium: 2 * 1024 * 1024 * 1024, // 1GB - 2GB
  // large: > 2GB
} as const;

/** Get model category based on size */
export function getModelCategory(sizeBytes: number): 'tiny' | 'small' | 'medium' | 'large' {
  if (sizeBytes < MODEL_SIZE_THRESHOLDS.tiny) return 'tiny';
  if (sizeBytes < MODEL_SIZE_THRESHOLDS.small) return 'small';
  if (sizeBytes < MODEL_SIZE_THRESHOLDS.medium) return 'medium';
  return 'large';
}

/** Type-safe model ID for curated LiteRT models */
export type LiteRTModelId = keyof typeof LITERT_MODELS;
