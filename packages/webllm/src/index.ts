/**
 * @localmode/webllm
 *
 * WebLLM provider for local-first LLM inference.
 * Uses 4-bit quantized models for efficient browser-based generation.
 *
 * @packageDocumentation
 */

// Provider
export { createWebLLM, webllm } from './provider.js';

// Model implementation
export { WebLLMLanguageModel, createLanguageModel } from './model.js';

// Utilities
export {
  isModelCached,
  preloadModel,
  deleteModelCache,
  getModelSize,
  isWebGPUAvailable,
} from './utils.js';

// Types
export type {
  WebLLMProvider,
  WebLLMProviderSettings,
  WebLLMModelSettings,
  WebLLMLoadProgress,
  WebLLMModelId,
} from './types.js';

export { WEBLLM_MODELS, MODEL_SIZE_THRESHOLDS, getModelCategory } from './types.js';
