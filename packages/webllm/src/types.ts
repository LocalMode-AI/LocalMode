/**
 * WebLLM Provider Types
 *
 * Provider-specific types for the WebLLM integration.
 *
 * @packageDocumentation
 */

import type { LanguageModel } from '@localmode/core';
import type { AppConfig } from '@mlc-ai/web-llm';

/** WebLLM artifact cache backend. */
export type WebLLMCacheBackend = 'cache' | 'indexeddb' | 'cross-origin';

/**
 * Progress callback for model loading.
 */
export interface WebLLMLoadProgress {
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
 * Provider-level settings for WebLLM models.
 */
export interface WebLLMProviderSettings {
  /**
   * Progress callback for model loading.
   */
  onProgress?: (progress: WebLLMLoadProgress) => void;

  /**
   * Custom app config for WebLLM.
   * Use this to specify custom model configurations.
   */
  appConfig?: Record<string, unknown>;

  /**
   * Use Web Worker for inference.
   * @default true
   */
  useWorker?: boolean;
}

/**
 * Model-level settings for WebLLM.
 */
export interface WebLLMModelSettings {
  /**
   * Override progress callback for this model.
   */
  onProgress?: (progress: WebLLMLoadProgress) => void;

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
   * @default 4096
   */
  contextLength?: number;

  /**
   * Use WebLLM's IndexedDB artifact cache instead of the Cache API.
   * Useful for large models in browser-extension contexts where Cache.add()
   * can fail during multi-gigabyte downloads.
   * @default false
   */
  useIndexedDBCache?: boolean;

  /**
   * WebLLM cache backend for model artifacts.
   * @default 'cache'
   */
  cacheBackend?: WebLLMCacheBackend;

  /**
   * Custom app config passed to WebLLM's CreateMLCEngine().
   */
  appConfig?: AppConfig;
}

/**
 * The WebLLM provider interface.
 */
export interface WebLLMProvider {
  /**
   * Create a language model for text generation.
   *
   * @example
   * ```ts
   * const model = webllm.languageModel('Llama-3.2-1B-Instruct-q4f16_1-MLC');
   * const { text } = await generateText({ model, prompt: 'Hello!' });
   * ```
   */
  languageModel(modelId: string, settings?: WebLLMModelSettings): LanguageModel;
}
