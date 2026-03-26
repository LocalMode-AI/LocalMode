/**
 * @localmode/wllama
 *
 * wllama provider for local-first LLM inference via llama.cpp WASM.
 * Runs any standard GGUF model in the browser without WebGPU.
 * Access 135,000+ GGUF models from HuggingFace.
 *
 * @packageDocumentation
 */

// Provider
export { createWllama, wllama } from './provider.js';

// Model implementation
export { WllamaLanguageModel, createLanguageModel } from './model.js';

// Utilities
export {
  isModelCached,
  preloadModel,
  deleteModelCache,
  isCrossOriginIsolated,
  resolveModelUrl,
} from './utils.js';

// GGUF metadata parser
export { parseGGUFMetadata, mapQuantizationType } from './gguf.js';

// Browser compatibility checker
export { checkGGUFBrowserCompat, checkGGUFBrowserCompatFromURL } from './compat.js';

// Types
export type {
  WllamaProvider,
  WllamaProviderSettings,
  WllamaModelSettings,
  WllamaLoadProgress,
} from './types.js';

// Models catalog
export type { WllamaModelId, WllamaModelEntry } from './models.js';

export { WLLAMA_MODELS, MODEL_SIZE_THRESHOLDS, getModelCategory } from './models.js';

// GGUF types
export type { GGUFMetadata } from './gguf.js';

// Compat types
export type { GGUFBrowserCompat } from './compat.js';
