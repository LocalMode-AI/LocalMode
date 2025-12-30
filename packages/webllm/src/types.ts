/**
 * WebLLM Provider Types
 *
 * Provider-specific types for the WebLLM integration.
 *
 * @packageDocumentation
 */

import type { LanguageModel } from '@localmode/core';

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
   * const model = webllm.languageModel('Llama-3.2-1B-Instruct-q4f16');
   * const { text } = await generateText({ model, prompt: 'Hello!' });
   * ```
   */
  languageModel(modelId: string, settings?: WebLLMModelSettings): LanguageModel;
}

/**
 * Popular WebLLM models (4-bit quantized for browser use).
 * Model IDs must match exactly what @mlc-ai/web-llm supports.
 */
export const WEBLLM_MODELS = {
  // === TINY MODELS (< 500MB) - Fast loading, quick responses ===
  'SmolLM2-135M-Instruct-q0f16-MLC': {
    name: 'SmolLM2 135M',
    contextLength: 2048,
    sizeBytes: 78 * 1024 * 1024, // 78MB
    size: '78MB',
    description: 'Tiniest model, instant loading',
  },
  'SmolLM2-360M-Instruct-q4f16_1-MLC': {
    name: 'SmolLM2 360M',
    contextLength: 2048,
    sizeBytes: 210 * 1024 * 1024, // 210MB
    size: '210MB',
    description: 'Very small, surprisingly capable',
  },
  'Qwen2.5-0.5B-Instruct-q4f16_1-MLC': {
    name: 'Qwen 2.5 0.5B',
    contextLength: 4096,
    sizeBytes: 278 * 1024 * 1024, // 278MB
    size: '278MB',
    description: 'Tiny Qwen, great quality for size',
  },

  // === SMALL MODELS (500MB - 1GB) - Good balance ===
  'Llama-3.2-1B-Instruct-q4f16_1-MLC': {
    name: 'Llama 3.2 1B',
    contextLength: 4096,
    sizeBytes: 712 * 1024 * 1024, // 712MB
    size: '712MB',
    description: 'Llama 3.2 1B, great for simple tasks',
  },
  'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC': {
    name: 'TinyLlama 1.1B',
    contextLength: 2048,
    sizeBytes: 800 * 1024 * 1024, // 800MB
    size: '800MB',
    description: 'TinyLlama, fast and capable',
  },
  'Qwen2.5-1.5B-Instruct-q4f16_1-MLC': {
    name: 'Qwen 2.5 1.5B',
    contextLength: 4096,
    sizeBytes: 868 * 1024 * 1024, // 868MB
    size: '868MB',
    description: 'Qwen 2.5 1.5B, multilingual',
  },

  // === MEDIUM MODELS (1GB - 2GB) - Better quality ===
  'SmolLM2-1.7B-Instruct-q4f16_1-MLC': {
    name: 'SmolLM2 1.7B',
    contextLength: 2048,
    sizeBytes: 1 * 1024 * 1024 * 1024, // 1GB
    size: '1GB',
    description: 'SmolLM 2 1.7B, best small model',
  },
  'gemma-2-2b-it-q4f16_1-MLC': {
    name: 'Gemma 2 2B',
    contextLength: 2048,
    sizeBytes: 1.44 * 1024 * 1024 * 1024, // 1.44GB
    size: '1.44GB',
    description: 'Google Gemma 2, instruction-tuned',
  },
  'Qwen2.5-3B-Instruct-q4f16_1-MLC': {
    name: 'Qwen 2.5 3B',
    contextLength: 4096,
    sizeBytes: 1.7 * 1024 * 1024 * 1024, // 1.7GB
    size: '1.7GB',
    description: 'Qwen 2.5 3B, high quality',
  },
  'Llama-3.2-3B-Instruct-q4f16_1-MLC': {
    name: 'Llama 3.2 3B',
    contextLength: 4096,
    sizeBytes: 1.76 * 1024 * 1024 * 1024, // 1.76GB
    size: '1.76GB',
    description: 'Llama 3.2 3B, excellent quality',
  },
  'Hermes-3-Llama-3.2-3B-q4f16_1-MLC': {
    name: 'Hermes 3 Llama 3.2 3B',
    contextLength: 4096,
    sizeBytes: 1.76 * 1024 * 1024 * 1024, // 1.76GB
    size: '1.76GB',
    description: 'Hermes Llama 3.2, enhanced chat',
  },

  // === LARGE MODELS (2GB+) - Best quality ===
  'Phi-3.5-mini-instruct-q4f16_1-MLC': {
    name: 'Phi 3.5 Mini',
    contextLength: 4096,
    sizeBytes: 2.1 * 1024 * 1024 * 1024, // 2.1GB
    size: '2.1GB',
    description: 'Microsoft Phi-3.5, excellent reasoning',
  },
  'DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC': {
    name: 'DeepSeek R1 Distill Qwen 7B',
    contextLength: 4096,
    sizeBytes: 4.18 * 1024 * 1024 * 1024, // 4.18GB
    size: '4.18GB',
    description: 'DeepSeek R1, advanced reasoning',
  },
  'DeepSeek-R1-Distill-Llama-8B-q4f16_1-MLC': {
    name: 'DeepSeek R1 Distill Llama 8B',
    contextLength: 4096,
    sizeBytes: 4.41 * 1024 * 1024 * 1024, // 4.41GB
    size: '4.41GB',
    description: 'DeepSeek R1 Llama, best reasoning',
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

export type WebLLMModelId = keyof typeof WEBLLM_MODELS;
