/**
 * Transformers Provider
 *
 * Factory for creating Transformers.js model instances.
 *
 * @packageDocumentation
 */

import type { TransformersProvider, TransformersProviderSettings, ModelSettings, LanguageModelSettings } from './types.js';
import {
  // Core implementations
  createEmbeddingModel,
  createClassificationModel,
  createZeroShotModel,
  createNERModel,
  createRerankerModel,
  createSpeechToTextModel,
  createImageClassificationModel,
  createZeroShotImageModel,
  createCaptionModel,
  // Extended implementations
  createSegmentationModel,
  createObjectDetectionModel,
  createImageFeatureModel,
  createImageToImageModel,
  createTextToSpeechModel,
  createTranslationModel,
  createSummarizationModel,
  createFillMaskModel,
  createQuestionAnsweringModel,
  createOCRModel,
  createDocumentQAModel,
  // Multimodal
  createCLIPEmbeddingModel,
  // Audio Classification & Depth Estimation
  createAudioClassificationModel,
  createZeroShotAudioClassificationModel,
  createDepthEstimationModel,
  // Language Model (TJS v4)
  createLanguageModel,
} from './implementations/index.js';

/**
 * Create a Transformers.js provider with custom settings.
 *
 * @param settings - Provider-level settings that apply to all models
 * @returns A TransformersProvider instance
 *
 * @example Basic usage
 * ```ts
 * import { createTransformers } from '@localmode/transformers';
 *
 * const myTransformers = createTransformers({
 *   device: 'webgpu',
 *   onProgress: (p) => console.log(`Loading: ${p.progress}%`),
 * });
 *
 * const embedder = myTransformers.embedding('Xenova/bge-small-en-v1.5');
 * ```
 *
 * @example With worker
 * ```ts
 * const workerTransformers = createTransformers({
 *   useWorker: true,
 * });
 * ```
 */
export function createTransformers(settings?: TransformersProviderSettings): TransformersProvider {
  const defaultSettings = {
    device: settings?.device,
    quantized: settings?.quantized ?? false,
    onProgress: settings?.onProgress,
  };

  return {
    embedding(modelId: string, modelSettings?: ModelSettings) {
      return createEmbeddingModel(modelId, {
        ...defaultSettings,
        ...modelSettings,
      });
    },

    classifier(modelId: string, modelSettings?: ModelSettings) {
      return createClassificationModel(modelId, {
        ...defaultSettings,
        ...modelSettings,
      });
    },

    zeroShot(modelId: string, modelSettings?: ModelSettings) {
      return createZeroShotModel(modelId, {
        ...defaultSettings,
        ...modelSettings,
      });
    },

    ner(modelId: string, modelSettings?: ModelSettings) {
      return createNERModel(modelId, {
        ...defaultSettings,
        ...modelSettings,
      });
    },

    reranker(modelId: string, modelSettings?: ModelSettings) {
      return createRerankerModel(modelId, {
        ...defaultSettings,
        ...modelSettings,
      });
    },

    speechToText(modelId: string, modelSettings?: ModelSettings) {
      return createSpeechToTextModel(modelId, {
        ...defaultSettings,
        ...modelSettings,
      });
    },

    imageClassifier(modelId: string, modelSettings?: ModelSettings) {
      return createImageClassificationModel(modelId, {
        ...defaultSettings,
        ...modelSettings,
      });
    },

    zeroShotImageClassifier(modelId: string, modelSettings?: ModelSettings) {
      return createZeroShotImageModel(modelId, {
        ...defaultSettings,
        ...modelSettings,
      });
    },

    captioner(modelId: string, modelSettings?: ModelSettings) {
      return createCaptionModel(modelId, {
        ...defaultSettings,
        ...modelSettings,
      });
    },

    // ═══════════════════════════════════════════════════════════════
    // EXTENDED MODEL FACTORIES
    // ═══════════════════════════════════════════════════════════════

    segmenter(modelId: string, modelSettings?: ModelSettings) {
      return createSegmentationModel(modelId, {
        ...defaultSettings,
        ...modelSettings,
      });
    },

    objectDetector(modelId: string, modelSettings?: ModelSettings) {
      return createObjectDetectionModel(modelId, {
        ...defaultSettings,
        ...modelSettings,
      });
    },

    imageFeatures(modelId: string, modelSettings?: ModelSettings) {
      return createImageFeatureModel(modelId, {
        ...defaultSettings,
        ...modelSettings,
      });
    },

    imageToImage(modelId: string, modelSettings?: ModelSettings) {
      return createImageToImageModel(modelId, {
        ...defaultSettings,
        ...modelSettings,
      });
    },

    textToSpeech(modelId: string, modelSettings?: ModelSettings) {
      return createTextToSpeechModel(modelId, {
        ...defaultSettings,
        ...modelSettings,
      });
    },

    translator(modelId: string, modelSettings?: ModelSettings) {
      return createTranslationModel(modelId, {
        ...defaultSettings,
        ...modelSettings,
      });
    },

    summarizer(modelId: string, modelSettings?: ModelSettings) {
      return createSummarizationModel(modelId, {
        ...defaultSettings,
        ...modelSettings,
      });
    },

    fillMask(modelId: string, modelSettings?: ModelSettings) {
      return createFillMaskModel(modelId, {
        ...defaultSettings,
        ...modelSettings,
      });
    },

    questionAnswering(modelId: string, modelSettings?: ModelSettings) {
      return createQuestionAnsweringModel(modelId, {
        ...defaultSettings,
        ...modelSettings,
      });
    },

    ocr(modelId: string, modelSettings?: ModelSettings) {
      return createOCRModel(modelId, {
        ...defaultSettings,
        ...modelSettings,
      });
    },

    documentQA(modelId: string, modelSettings?: ModelSettings) {
      return createDocumentQAModel(modelId, {
        ...defaultSettings,
        ...modelSettings,
      });
    },

    // ═══════════════════════════════════════════════════════════════
    // MULTIMODAL MODEL FACTORIES
    // ═══════════════════════════════════════════════════════════════

    multimodalEmbedding(modelId: string, modelSettings?: ModelSettings) {
      return createCLIPEmbeddingModel(modelId, {
        ...defaultSettings,
        ...modelSettings,
      });
    },

    // ═══════════════════════════════════════════════════════════════
    // AUDIO CLASSIFICATION & DEPTH ESTIMATION
    // ═══════════════════════════════════════════════════════════════

    audioClassifier(modelId: string, modelSettings?: ModelSettings) {
      return createAudioClassificationModel(modelId, {
        ...defaultSettings,
        ...modelSettings,
      });
    },

    zeroShotAudioClassifier(modelId: string, modelSettings?: ModelSettings) {
      return createZeroShotAudioClassificationModel(modelId, {
        ...defaultSettings,
        ...modelSettings,
      });
    },

    depthEstimator(modelId: string, modelSettings?: ModelSettings) {
      return createDepthEstimationModel(modelId, {
        ...defaultSettings,
        ...modelSettings,
      });
    },

    // ═══════════════════════════════════════════════════════════════
    // LANGUAGE MODEL FACTORY (Experimental — TJS v4)
    // ═══════════════════════════════════════════════════════════════

    languageModel(modelId: string, modelSettings?: LanguageModelSettings) {
      return createLanguageModel(modelId, {
        ...defaultSettings,
        ...modelSettings,
      });
    },
  };
}

/**
 * Default Transformers.js provider instance.
 *
 * Use this for quick access without custom configuration.
 *
 * @example
 * ```ts
 * import { transformers } from '@localmode/transformers';
 * import { embed } from '@localmode/core';
 *
 * const { embedding } = await embed({
 *   model: transformers.embedding('Xenova/bge-small-en-v1.5'),
 *   value: 'Hello world',
 * });
 * ```
 */
export const transformers: TransformersProvider = createTransformers();

