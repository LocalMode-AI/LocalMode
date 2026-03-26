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
 *   model: transformers.embedding('Xenova/bge-small-en-v1.5'),
 *   value: 'Hello world',
 * });
 *
 * // Classification
 * const { label } = await classify({
 *   model: transformers.classifier('Xenova/distilbert-base-uncased-finetuned-sst-2-english'),
 *   text: 'I love this!',
 * });
 *
 * // Speech-to-text
 * const { text } = await transcribe({
 *   model: transformers.speechToText('onnx-community/moonshine-tiny-ONNX'),
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
 * const model = myTransformers.embedding('Xenova/bge-small-en-v1.5');
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
  LanguageModelSettings,
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
  TEXT_TO_SPEECH_MODELS,
  IMAGE_CLASSIFICATION_MODELS,
  ZERO_SHOT_IMAGE_MODELS,
  IMAGE_CAPTION_MODELS,
  MULTIMODAL_EMBEDDING_MODELS,
  TRANSLATION_MODELS,
  SUMMARIZATION_MODELS,
  FILL_MASK_MODELS,
  QUESTION_ANSWERING_MODELS,
  OBJECT_DETECTION_MODELS,
  SEGMENTATION_MODELS,
  OCR_MODELS,
  DOCUMENT_QA_MODELS,
  IMAGE_TO_IMAGE_MODELS,
  IMAGE_FEATURE_MODELS,
  TRANSFORMERS_LLM_MODELS,
  getLLMModelCategory,
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
  TransformersCLIPEmbeddingModel,
  TransformersLanguageModel,
} from './implementations/index.js';

