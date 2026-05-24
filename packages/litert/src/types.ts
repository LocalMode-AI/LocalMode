/**
 * LiteRT Provider Types
 *
 * Provider-specific types for the LiteRT (TensorFlow Lite) integration.
 *
 * @packageDocumentation
 */

import type { LanguageModel } from '@localmode/core';

/**
 * Progress callback for model loading.
 *
 * Structurally identical to {@link WllamaLoadProgress} and
 * {@link WebLLMLoadProgress} to enable shared UI components
 * for progress display.
 */
export interface LiteRTLoadProgress {
  /** Current status */
  status: 'initiate' | 'download' | 'progress' | 'done' | 'ready';

  /** Progress percentage (0-100) */
  progress?: number;

  /** Bytes loaded */
  loaded?: number;

  /** Total bytes */
  total?: number;

  /** Human-readable step description */
  text?: string;
}

/**
 * Model-level settings for LiteRT.
 */
export interface LiteRTModelSettings {
  /**
   * Override progress callback for this model.
   */
  onProgress?: (progress: LiteRTLoadProgress) => void;

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
   * If not set, uses the value from the model catalog; falls back to 4096.
   * @default 4096
   */
  contextLength?: number;

  /**
   * Full URL to the model file.
   * Overrides ID-based URL construction.
   */
  modelUrl?: string;

  /**
   * Inference backend to use.
   * If not set, LiteRT-LM picks its own default (WebGPU when available).
   */
  backend?: 'GPU' | 'CPU';
}

/**
 * Provider-level settings for LiteRT models.
 */
export interface LiteRTProviderSettings {
  /**
   * Progress callback for model loading.
   */
  onProgress?: (progress: LiteRTLoadProgress) => void;

  /**
   * Default inference backend.
   * If not set, auto-detected based on device capabilities.
   */
  backend?: 'GPU' | 'CPU';
}

/**
 * The LiteRT provider interface.
 */
export interface LiteRTProvider {
  /**
   * Create a language model for text generation.
   *
   * @example
   * ```ts
   * const model = litert.languageModel('gemma-4-E2B');
   * const { text } = await generateText({ model, prompt: 'Hello!' });
   * ```
   */
  languageModel(modelId: string, settings?: LiteRTModelSettings): LanguageModel;
}

/**
 * Browser compatibility check result for LiteRT inference.
 */
export interface LiteRTBrowserCompat {
  /** Whether the browser can run LiteRT models at all */
  canRun: boolean;

  /** Whether WebGPU is available */
  hasWebGPU: boolean;

  /** Selected inference backend */
  backend: 'GPU' | 'CPU' | 'none';

  /** Device RAM in bytes, or null if unavailable */
  deviceRAM: number | null;

  /** Human-readable device RAM (e.g. '8 GB') */
  deviceRAMHuman: string;

  /** Non-fatal warnings (e.g. low RAM, no GPU) */
  warnings: string[];

  /** Actionable recommendations for the user */
  recommendations: string[];
}
