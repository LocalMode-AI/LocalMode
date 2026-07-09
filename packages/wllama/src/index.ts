/**
 * @localmode/wllama
 *
 * wllama provider for local-first LLM inference via llama.cpp WASM.
 * Runs any standard GGUF model in the browser without WebGPU.
 * Access 160,000+ GGUF models from HuggingFace.
 *
 * @packageDocumentation
 */

// Provider
export { createWllama, wllama } from './provider.js';

// Model implementations
export { WllamaLanguageModel, createLanguageModel } from './model.js';
export { WllamaEmbeddingModel } from './embedding.js';
export { WllamaRerankerModel, createRerankerModel } from './reranker.js';

// Utilities
export {
  isModelCached,
  preloadModel,
  deleteModelCache,
  listCachedModels,
  clearAllModelCache,
  refreshModel,
  isCrossOriginIsolated,
  resolveModelUrl,
} from './utils.js';

// GGUF metadata parser
export { parseGGUFMetadata, mapQuantizationType } from './gguf.js';

// Browser compatibility checker
export { checkGGUFBrowserCompat, checkGGUFBrowserCompatFromURL } from './compat.js';

// GGUF model discovery (HuggingFace search + file listing)
export { searchGGUFModels, listGGUFFiles, HFApiError } from './discovery.js';

// Types
export type {
  WllamaProvider,
  WllamaProviderSettings,
  WllamaModelSettings,
  WllamaEmbeddingSettings,
  WllamaRerankerSettings,
  WllamaResponseFormat,
  WllamaLoadProgress,
} from './types.js';

// Models catalog
export type { WllamaModelId, WllamaModelEntry } from './models.js';

export { WLLAMA_MODELS, MODEL_SIZE_THRESHOLDS, getModelCategory } from './models.js';

// GGUF types
export type { GGUFMetadata } from './gguf.js';

// Compat types
export type { GGUFBrowserCompat } from './compat.js';

// GGUF model discovery types
export type {
  HFSort,
  HFModelSearchResult,
  HFModelFile,
  HFApiErrorKind,
} from './discovery.js';
