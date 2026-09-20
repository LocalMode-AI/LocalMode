/**
 * wllama Provider Types
 *
 * Provider-specific types for the wllama (llama.cpp WASM) integration.
 *
 * @packageDocumentation
 */

import type { LanguageModel, EmbeddingModel, RerankerModel } from '@localmode/core';

/**
 * Progress callback for model loading.
 *
 * Structurally identical to {@link WebLLMLoadProgress} to enable
 * shared UI components for progress display.
 */
export interface WllamaLoadProgress {
  /** Current status */
  status: 'initiate' | 'download' | 'progress' | 'done' | 'ready';

  /** Progress percentage (0-100) */
  progress?: number;

  /** Bytes loaded */
  loaded?: number;

  /** Total bytes */
  total?: number;

  /** Current step description */
  text?: string;
}

/**
 * Provider-level settings for wllama models.
 */
export interface WllamaProviderSettings {
  /**
   * Progress callback for model loading.
   */
  onProgress?: (progress: WllamaLoadProgress) => void;

  /**
   * Override thread count.
   * Default: auto-detect from CORS isolation (multi-thread if isolated, 1 if not).
   */
  numThreads?: number;

  /**
   * Custom cache directory name for model files.
   */
  cacheDir?: string;
}

/**
 * Model-level settings for wllama.
 */
export interface WllamaModelSettings {
  /**
   * Override progress callback for this model.
   */
  onProgress?: (progress: WllamaLoadProgress) => void;

  /**
   * System prompt to prepend to all requests.
   */
  systemPrompt?: string;

  /**
   * Default temperature for generation.
   * @default 0.7
   */
  temperature?: number;

  /**
   * Default top_p for generation.
   * @default 0.95
   */
  topP?: number;

  /**
   * Default max tokens for generation.
   * @default 512
   */
  maxTokens?: number;

  /**
   * Context length for this model.
   * If not set, auto-detected from GGUF metadata; falls back to 4096.
   * @default 4096
   */
  contextLength?: number;

  /**
   * Override thread count for this model.
   */
  numThreads?: number;

  /**
   * Full URL to the GGUF file.
   * Overrides ID-based URL construction.
   */
  modelUrl?: string;

  /**
   * Custom cache directory name for model files.
   */
  cacheDir?: string;

  /**
   * Enable native Jinja chat template parsing.
   * When true, v3's Jinja engine handles chat formatting for createChatCompletion().
   * @default true
   */
  useJinja?: boolean;

  /**
   * WebGPU offload for inference. wllama itself offloads every layer to WebGPU
   * whenever `navigator.gpu` exists, so the effective default is `'auto'`:
   * - `true`: offload all layers (pure WASM if WebGPU is unavailable)
   * - `'auto'` or omitted: offload when WebGPU is available (wllama's default)
   * - `false`: pure WASM on the CPU (`n_gpu_layers: 0`)
   * `gpuAccelerated` on the model reports what llama.cpp actually did once loaded.
   * @default 'auto'
   */
  useWebGPU?: boolean | 'auto';

  /**
   * Number of transformer layers to offload to GPU.
   * Takes precedence over `useWebGPU`. Use -1 for all layers.
   */
  nGpuLayers?: number;

  /**
   * URL to the vision projection model (mmproj GGUF).
   * When provided, enables multimodal vision input.
   */
  mmprojUrl?: string;

  /**
   * Load the vision projector so image parts work. Defaults to true, which
   * loads the catalog's projector for models that ship one (Gemma 4, Holo2)
   * or an explicit `mmprojUrl`. Set false for text-only use: the language
   * model loads alone, no projector is downloaded (hundreds of MB), the wasm
   * heap keeps that memory (a 3.5 GB GGUF plus its projector does not fit the
   * CPU-only 4 GB heap), and wllama's model cache stays enabled (it is turned
   * off for multi-file sources), so the load is served from the cache.
   * `supportsVision` reports false and image parts are rejected.
   * @default true
   */
  vision?: boolean;

  /**
   * Enable reasoning mode (DeepSeek-R1 style thinking).
   */
  reasoning?: boolean;

  /**
   * Reasoning format for thinking models.
   * @default 'deepseek'
   */
  reasoningFormat?: 'none' | 'deepseek-legacy' | 'deepseek';

  /**
   * Token budget for reasoning/thinking.
   */
  reasoningBudgetTokens?: number;

  /**
   * KV cache quantization type for keys. Reduces memory for long contexts.
   */
  cacheTypeK?: 'f32' | 'f16' | 'q8_0' | 'q5_1' | 'q5_0' | 'q4_1' | 'q4_0';

  /**
   * KV cache quantization type for values. Reduces memory for long contexts.
   */
  cacheTypeV?: 'f32' | 'f16' | 'q8_0' | 'q5_1' | 'q5_0' | 'q4_1' | 'q4_0';

  /**
   * Enable flash attention for faster inference.
   */
  flashAttention?: boolean;

  /**
   * URL to a draft model for speculative decoding (2-3x speedup).
   */
  specDraftModel?: string;

  /**
   * GPU layers for the draft model.
   */
  specDraftNgl?: number;

  /**
   * Minimum draft tokens for speculative decoding.
   */
  specDraftNMin?: number;

  /**
   * Maximum draft tokens for speculative decoding.
   */
  specDraftNMax?: number;

  /**
   * Minimum probability threshold for speculative decoding.
   */
  specDraftPMin?: number;

  /**
   * LoRA adapters to load with the model.
   */
  loraAdapters?: Array<{ path: string; scale?: number }>;

  /**
   * Initialize LoRA without applying (for manual control).
   */
  loraInitWithoutApply?: boolean;
}

/**
 * Settings for wllama embedding models.
 */
export interface WllamaEmbeddingSettings {
  /** Override progress callback for this model. */
  onProgress?: (progress: WllamaLoadProgress) => void;

  /** Override thread count for this model. */
  numThreads?: number;

  /** Full URL to the GGUF file. */
  modelUrl?: string;

  /** Context length for this model. @default 512 */
  contextLength?: number;

  /** Embedding vector dimensions. Auto-detected from GGUF metadata if not set. */
  dimensions?: number;

  /** WebGPU offload: `'auto'` (wllama's default, GPU when available) or omitted, `true`, or `false` for pure WASM. @default 'auto' */
  useWebGPU?: boolean | 'auto';

  /** Number of transformer layers to offload to GPU (0 pins the CPU). */
  nGpuLayers?: number;
}

/**
 * Settings for wllama reranker models.
 */
export interface WllamaRerankerSettings {
  /** Override progress callback for this model. */
  onProgress?: (progress: WllamaLoadProgress) => void;

  /** Override thread count for this model. */
  numThreads?: number;

  /** Full URL to the GGUF file. */
  modelUrl?: string;

  /** Context length for this model. @default 1024 */
  contextLength?: number;

  /** WebGPU offload: `'auto'` (wllama's default, GPU when available) or omitted, `true`, or `false` for pure WASM. @default 'auto' */
  useWebGPU?: boolean | 'auto';

  /** Number of transformer layers to offload to GPU (0 pins the CPU). */
  nGpuLayers?: number;
}

/**
 * Response format for structured output / JSON mode.
 */
export type WllamaResponseFormat =
  | { type: 'text' }
  | { type: 'json_object' }
  | { type: 'json_schema'; json_schema: { name: string; schema: Record<string, unknown>; strict?: boolean } };

/**
 * The wllama provider interface.
 */
export interface WllamaProvider {
  /**
   * Create a language model for text generation.
   *
   * @example
   * ```ts
   * const model = wllama.languageModel('bartowski/Llama-3.2-1B-Instruct-GGUF:Llama-3.2-1B-Instruct-Q4_K_M.gguf');
   * const { text } = await generateText({ model, prompt: 'Hello!' });
   * ```
   */
  languageModel(modelId: string, settings?: WllamaModelSettings): LanguageModel;

  /**
   * Create an embedding model for text embeddings from a GGUF model.
   *
   * @example
   * ```ts
   * const model = wllama.embedding('nomic-ai/nomic-embed-text-v1.5-GGUF:nomic-embed-text-v1.5.Q4_K_M.gguf');
   * const { embedding } = await embed({ model, value: 'Hello world' });
   * ```
   */
  embedding(modelId: string, settings?: WllamaEmbeddingSettings): EmbeddingModel;

  /**
   * Create a reranker model from a GGUF cross-encoder model.
   *
   * @example
   * ```ts
   * const model = wllama.reranker('jina-reranker-v2-base-multilingual-Q4_K_M');
   * const { results } = await rerank({ model, query: 'search query', documents: ['doc1', 'doc2'] });
   * ```
   */
  reranker(modelId: string, settings?: WllamaRerankerSettings): RerankerModel;
}

