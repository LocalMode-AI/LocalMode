/**
 * @file extractor.service.ts
 * @description Service for creating language models for structured extraction
 */

import { webllm } from '@localmode/webllm';
import { DEFAULT_MODEL_ID } from '../_lib/constants';

/** Cached model instances by model ID */
const modelCache = new Map<string, ReturnType<typeof webllm.languageModel>>();

/**
 * Get or create a language model instance.
 * Returns a cached singleton per model ID.
 */
export function getModel(modelId: string = DEFAULT_MODEL_ID) {
  if (!modelCache.has(modelId)) {
    modelCache.set(modelId, webllm.languageModel(modelId));
  }
  return modelCache.get(modelId)!;
}
