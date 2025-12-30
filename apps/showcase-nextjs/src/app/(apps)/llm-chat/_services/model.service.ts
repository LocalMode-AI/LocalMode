/**
 * @file model.service.ts
 * @description Service for model management using @localmode/webllm
 */
import {
  WEBLLM_MODELS,
  getModelCategory,
  deleteModelCache,
  isModelCached,
  preloadModel,
  type WebLLMModelId,
} from '@localmode/webllm';

/**
 * Get all available models with their info
 */
export function getAvailableModels() {
  return Object.entries(WEBLLM_MODELS).map(([id, info]) => ({
    id: id as WebLLMModelId,
    name: info.name,
    contextLength: info.contextLength,
    size: info.size,
    sizeBytes: info.sizeBytes,
    description: info.description,
    category: getModelCategory(info.sizeBytes),
  }));
}

/**
 * Check if a model is cached locally
 * @param modelId - The model ID to check
 */
export async function checkModelCached(modelId: string) {
  return isModelCached(modelId);
}

/**
 * Load a model with progress callback
 * @param modelId - The model ID to load
 * @param onProgress - Optional progress callback
 */
export async function loadModel(
  modelId: string,
  onProgress?: (progress: number) => void
) {
  return preloadModel(modelId, {
    onProgress: (p) => onProgress?.(p.progress ?? 0),
  });
}

/**
 * Delete a model's cache
 * @param modelId - The model ID to delete
 */
export async function deleteCache(modelId: string) {
  return deleteModelCache(modelId);
}

/**
 * Get display name for a model ID
 * @param modelId - The model ID
 */
export function getModelDisplayName(modelId: string) {
  const model = WEBLLM_MODELS[modelId as WebLLMModelId];
  return model?.name || modelId.replace('-MLC', '').replace(/_/g, ' ');
}
