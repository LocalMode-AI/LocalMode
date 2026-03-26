/**
 * wllama Provider Types
 *
 * Provider-specific types for the wllama (llama.cpp WASM) integration.
 *
 * @packageDocumentation
 */

import type { LanguageModel } from '@localmode/core';

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
}

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
}

