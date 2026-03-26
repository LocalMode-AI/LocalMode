/**
 * @localmode/react
 *
 * React hooks for local-first AI. Embed, chat, classify, transcribe,
 * and more — with built-in loading states, error handling, and cancellation.
 *
 * @packageDocumentation
 */

// Core types
export type {
  UseOperationReturn,
  UseStreamingReturn,
  ReactChatMessage,
  ImageAttachment,
  PipelineStep,
  PipelineProgress,
  UseChatOptions,
  UseChatReturn,
  UseSemanticSearchOptions,
  UseSemanticSearchReturn,
  UsePipelineReturn,
} from './core/types.js';

export type {
  BatchProgress,
  BatchItemResult,
  UseBatchOperationReturn,
} from './core/use-batch-operation.js';

export type { UseOperationListReturn } from './core/use-operation-list.js';
export type { SequentialBatchProgress, UseSequentialBatchReturn } from './core/use-sequential-batch.js';
export type { AppError } from './core/app-error.js';

// Domain hooks — Embeddings
export { useEmbed } from './hooks/use-embed.js';
export { useEmbedMany } from './hooks/use-embed-many.js';
export { useSemanticSearch } from './hooks/use-semantic-search.js';
export { useEmbedImage } from './hooks/use-embed-image.js';
export { useEmbedManyImages } from './hooks/use-embed-many-images.js';

// Domain hooks — Chat & Generation
export { useChat } from './hooks/use-chat.js';
export { useGenerateText } from './hooks/use-generate-text.js';
export { useGenerateObject } from './hooks/use-generate-object.js';
export type { UseGenerateObjectOptions } from './hooks/use-generate-object.js';

// Domain hooks — Classification
export { useClassify } from './hooks/use-classify.js';
export { useClassifyZeroShot } from './hooks/use-classify-zero-shot.js';
export { useExtractEntities } from './hooks/use-extract-entities.js';

// Domain hooks — Audio
export { useTranscribe } from './hooks/use-transcribe.js';
export { useSynthesizeSpeech } from './hooks/use-synthesize-speech.js';

// Domain hooks — Vision
export { useCaptionImage } from './hooks/use-caption-image.js';
export { useDetectObjects } from './hooks/use-detect-objects.js';
export { useClassifyImage } from './hooks/use-classify-image.js';
export { useClassifyImageZeroShot } from './hooks/use-classify-image-zero-shot.js';
export { useSegmentImage } from './hooks/use-segment-image.js';
export { useExtractImageFeatures } from './hooks/use-extract-image-features.js';
export { useImageToImage } from './hooks/use-image-to-image.js';

// Domain hooks — Text Processing
export { useTranslate } from './hooks/use-translate.js';
export { useSummarize } from './hooks/use-summarize.js';
export { useExtractText } from './hooks/use-extract-text.js';
export { useFillMask } from './hooks/use-fill-mask.js';
export { useAnswerQuestion } from './hooks/use-answer-question.js';
export { useAskDocument } from './hooks/use-ask-document.js';

// Domain hooks — RAG
export { useSemanticChunk } from './hooks/use-semantic-chunk.js';

// Utility hooks
export { useModelStatus } from './utilities/use-model-status.js';
export { useCapabilities } from './utilities/use-capabilities.js';
export { useAdaptiveBatchSize } from './hooks/use-adaptive-batch-size.js';
export { useNetworkStatus } from './utilities/use-network-status.js';
export { useStorageQuota } from './utilities/use-storage-quota.js';
export { useVoiceRecorder } from './utilities/use-voice-recorder.js';
export type { UseVoiceRecorderOptions, UseVoiceRecorderReturn } from './utilities/use-voice-recorder.js';
export { useModelRecommendations } from './utilities/use-model-recommendations.js';
export type {
  UseModelRecommendationsOptions,
  UseModelRecommendationsReturn,
} from './utilities/use-model-recommendations.js';

// Batch & list processing
export { useBatchOperation } from './core/use-batch-operation.js';
export { useOperationList } from './core/use-operation-list.js';
export { useSequentialBatch } from './core/use-sequential-batch.js';

// Utilities
export { toAppError } from './core/app-error.js';

// Re-export jsonSchema from core for convenience
export { jsonSchema } from '@localmode/core';

// Helpers (browser utilities)
export { readFileAsDataUrl } from './helpers/read-file.js';
export { validateFile } from './helpers/validate-file.js';
export type { ValidateFileOptions } from './helpers/validate-file.js';
export { downloadBlob } from './helpers/download.js';

// Pipeline
export { usePipeline } from './hooks/use-pipeline.js';
export {
  embedStep,
  embedManyStep,
  searchStep,
  chunkStep,
  storeStep,
  classifyStep,
  rerankStep,
  summarizeStep,
  generateStep,
  semanticChunkStep,
} from './hooks/pipeline-steps.js';

// Inference Queue
export { useInferenceQueue } from './utilities/use-inference-queue.js';
export type { UseInferenceQueueReturn } from './utilities/use-inference-queue.js';

// Model Loader
export { useModelLoader } from './utilities/use-model-loader.js';
export type { UseModelLoaderReturn } from './utilities/use-model-loader.js';

// Semantic Cache
export { useSemanticCache } from './hooks/use-semantic-cache.js';
export type { UseSemanticCacheOptions, UseSemanticCacheReturn } from './hooks/use-semantic-cache.js';

// Reindex (Embedding Drift Detection)
export { useReindex } from './hooks/use-reindex.js';
export type { UseReindexOptions, UseReindexReturn } from './hooks/use-reindex.js';

// Agent
export { useAgent } from './hooks/use-agent.js';
export type { UseAgentOptions, UseAgentReturn } from './hooks/use-agent.js';

// Import/Export
export { useImportExport } from './hooks/use-import-export.js';
export type { UseImportExportOptions } from './hooks/use-import-export.js';

// Evaluation
export { useEvaluateModel } from './hooks/use-evaluate-model.js';

// Threshold Calibration
export { useCalibrateThreshold } from './hooks/use-calibrate-threshold.js';
export type { UseCalibrateThresholdOptions, UseCalibrateThresholdReturn } from './hooks/use-calibrate-threshold.js';
