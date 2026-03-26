/**
 * @file evaluator.service.ts
 * @description Service providing model factories for classification and embedding from @localmode/transformers
 */
import { transformers } from '@localmode/transformers';

/** Get a classification model instance by HuggingFace model ID */
export function getClassifierModel(modelId: string) {
  return transformers.classifier(modelId);
}

/** Get an embedding model instance by HuggingFace model ID */
export function getEmbeddingModel(modelId: string) {
  return transformers.embedding(modelId);
}
