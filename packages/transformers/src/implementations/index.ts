/**
 * Transformers Model Implementations
 *
 * All model implementation exports.
 *
 * @packageDocumentation
 */

// ═══════════════════════════════════════════════════════════════
// Core Implementations
// ═══════════════════════════════════════════════════════════════

export { TransformersEmbeddingModel, createEmbeddingModel } from './embedding.js';
export { TransformersClassificationModel, createClassificationModel } from './classifier.js';
export { TransformersZeroShotModel, createZeroShotModel } from './zero-shot.js';
export { TransformersNERModel, createNERModel } from './ner.js';
export { TransformersRerankerModel, createRerankerModel } from './reranker.js';
export { TransformersSpeechToTextModel, createSpeechToTextModel } from './speech-to-text.js';
export {
  TransformersImageClassificationModel,
  createImageClassificationModel,
} from './image-classifier.js';
export { TransformersZeroShotImageModel, createZeroShotImageModel } from './zero-shot-image.js';
export { TransformersCaptionModel, createCaptionModel } from './captioner.js';

// ═══════════════════════════════════════════════════════════════
// Extended Implementations
// ═══════════════════════════════════════════════════════════════

// Vision
export { TransformersSegmentationModel, createSegmentationModel } from './segmenter.js';
export { TransformersObjectDetectionModel, createObjectDetectionModel } from './object-detector.js';
export { TransformersImageFeatureModel, createImageFeatureModel } from './image-feature.js';
export { TransformersImageToImageModel, createImageToImageModel } from './image-to-image.js';

// Audio
export { TransformersTextToSpeechModel, createTextToSpeechModel } from './text-to-speech.js';
export {
  TransformersAudioClassificationModel,
  createAudioClassificationModel,
  TransformersZeroShotAudioClassificationModel,
  createZeroShotAudioClassificationModel,
} from './audio-classifier.js';

// Translation & Summarization
export { TransformersTranslationModel, createTranslationModel } from './translator.js';
export { TransformersSummarizationModel, createSummarizationModel } from './summarizer.js';

// Language Understanding
export { TransformersFillMaskModel, createFillMaskModel } from './fill-mask.js';
export { TransformersQuestionAnsweringModel, createQuestionAnsweringModel } from './question-answering.js';

// OCR & Document QA
export { TransformersOCRModel, createOCRModel } from './ocr.js';
export { TransformersDocumentQAModel, createDocumentQAModel } from './document-qa.js';

// Multimodal Embeddings (CLIP/SigLIP)
export { TransformersCLIPEmbeddingModel, createCLIPEmbeddingModel } from './clip-embedding.js';

// Depth Estimation
export { TransformersDepthEstimationModel, createDepthEstimationModel } from './depth-estimator.js';

// ═══════════════════════════════════════════════════════════════
// Language Model (Experimental — TJS v4)
// ═══════════════════════════════════════════════════════════════

export { TransformersLanguageModel, createLanguageModel } from './language-model.js';
