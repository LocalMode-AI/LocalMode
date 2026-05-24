/**
 * @localmode/litert
 *
 * LiteRT-LM provider for local-first LLM inference via Google's on-device
 * engine. Runs `.litertlm` models in the browser on a WebGPU backend with an
 * automatic CPU (WASM) fallback. Text-in / text-out.
 *
 * @packageDocumentation
 */

// Provider
export { createLitert, litert } from './provider.js';

// Model implementation
export { LiteRTLanguageModel, createLanguageModel } from './model.js';

// Utilities
export {
  isModelCached,
  preloadModel,
  deleteModelCache,
  resolveModelUrl,
  checkLiteRTBrowserCompat,
  fetchModelStream,
  isWebGPUDeviceUsable,
  resetWebGPUUsableCache,
} from './utils.js';

// Types
export type {
  LiteRTProvider,
  LiteRTProviderSettings,
  LiteRTModelSettings,
  LiteRTLoadProgress,
  LiteRTBrowserCompat,
} from './types.js';

// Models catalog
export type { LiteRTModelId, LiteRTModelEntry } from './models.js';
export { LITERT_MODELS, MODEL_SIZE_THRESHOLDS, getModelCategory } from './models.js';
