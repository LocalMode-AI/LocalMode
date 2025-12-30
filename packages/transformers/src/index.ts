/**
 * @localmode/transformers
 *
 * Transformers.js provider for @localmode - implements all ML model interfaces.
 *
 * @packageDocumentation
 *
 * @example Basic usage
 * ```ts
 * import { transformers } from '@localmode/transformers';
 * import { embed, classify, transcribe } from '@localmode/core';
 *
 * // Embeddings
 * const { embedding } = await embed({
 *   model: transformers.embedding('Xenova/all-MiniLM-L6-v2'),
 *   value: 'Hello world',
 * });
 *
 * // Classification
 * const { label } = await classify({
 *   model: transformers.classifier('Xenova/distilbert-sst-2'),
 *   text: 'I love this!',
 * });
 *
 * // Speech-to-text
 * const { text } = await transcribe({
 *   model: transformers.speechToText('Xenova/whisper-tiny'),
 *   audio: audioBlob,
 * });
 * ```
 *
 * @example Custom configuration
 * ```ts
 * import { createTransformers } from '@localmode/transformers';
 *
 * const myTransformers = createTransformers({
 *   device: 'webgpu',
 *   onProgress: (p) => console.log(`Loading: ${p.progress}%`),
 * });
 *
 * const model = myTransformers.embedding('Xenova/all-MiniLM-L6-v2');
 * ```
 */

// ═══════════════════════════════════════════════════════════════
// PROVIDER
// ═══════════════════════════════════════════════════════════════

export { transformers, createTransformers } from './provider.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type {
  TransformersProvider,
  TransformersProviderSettings,
  TransformersDevice,
  ModelSettings,
  ModelLoadProgress,
} from './types.js';

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

export {
  isWebGPUAvailable,
  getOptimalDevice,
  isModelCached,
  preloadModel,
  clearModelCache,
  getModelStorageUsage,
} from './utils.js';

// ═══════════════════════════════════════════════════════════════
// POPULAR MODELS
// ═══════════════════════════════════════════════════════════════

export {
  MODELS,
  EMBEDDING_MODELS,
  CLASSIFICATION_MODELS,
  ZERO_SHOT_MODELS,
  NER_MODELS,
  RERANKER_MODELS,
  SPEECH_TO_TEXT_MODELS,
  IMAGE_CLASSIFICATION_MODELS,
  ZERO_SHOT_IMAGE_MODELS,
  IMAGE_CAPTION_MODELS,
} from './models.js';

// ═══════════════════════════════════════════════════════════════
// MODEL IMPLEMENTATIONS (for advanced use cases)
// ═══════════════════════════════════════════════════════════════

export {
  TransformersEmbeddingModel,
  TransformersClassificationModel,
  TransformersZeroShotModel,
  TransformersNERModel,
  TransformersRerankerModel,
  TransformersSpeechToTextModel,
  TransformersImageClassificationModel,
  TransformersZeroShotImageModel,
  TransformersCaptionModel,
} from './implementations/index.js';

