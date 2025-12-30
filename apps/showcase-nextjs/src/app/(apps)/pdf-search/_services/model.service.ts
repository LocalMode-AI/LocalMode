/**
 * @file model.service.ts
 * @description Service for model management using @localmode/transformers
 */
import { preloadModel, isModelCached, getModelStorageUsage } from '@localmode/transformers';
import { MODELS, MODEL_SIZES } from '../_lib/constants';

/** Model info for display */
export interface ModelInfo {
  /** Model identifier */
  id: string;
  /** Display name */
  name: string;
  /** Model size */
  size: string;
  /** Whether model is cached */
  isCached: boolean;
}

/**
 * Get all required models with their info
 */
export async function getRequiredModels(): Promise<ModelInfo[]> {
  const [embeddingCached, rerankerCached] = await Promise.all([
    isModelCached(MODELS.EMBEDDING),
    isModelCached(MODELS.RERANKER),
  ]);

  return [
    {
      id: MODELS.EMBEDDING,
      name: 'Embedding Model',
      size: MODEL_SIZES[MODELS.EMBEDDING],
      isCached: embeddingCached,
    },
    {
      id: MODELS.RERANKER,
      name: 'Reranker Model',
      size: MODEL_SIZES[MODELS.RERANKER],
      isCached: rerankerCached,
    },
  ];
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
export async function loadModel(modelId: string, onProgress?: (progress: number) => void) {
  return preloadModel(modelId, {
    onProgress: (p) => onProgress?.(p.progress ?? 0),
  });
}

/**
 * Load all required models
 * @param useReranking - Whether to load reranker model
 * @param onProgress - Progress callback with model name and progress
 */
export async function loadRequiredModels(
  useReranking: boolean,
  onProgress?: (modelName: string, progress: number) => void
) {
  // Load embedding model
  onProgress?.('Embedding Model', 0);
  await loadModel(MODELS.EMBEDDING, (p) => onProgress?.('Embedding Model', p));

  // Load reranker if needed
  if (useReranking) {
    onProgress?.('Reranker Model', 0);
    await loadModel(MODELS.RERANKER, (p) => onProgress?.('Reranker Model', p));
  }
}

/**
 * Get storage usage for models (total browser storage estimate)
 */
export async function getModelsStorageUsage() {
  const totalUsage = await getModelStorageUsage();

  return {
    total: totalUsage,
  };
}

/**
 * Get display name for a model ID
 * @param modelId - The model ID
 */
export function getModelDisplayName(modelId: string) {
  if (modelId === MODELS.EMBEDDING) return 'Embedding Model';
  if (modelId === MODELS.RERANKER) return 'Reranker Model';
  return modelId.split('/').pop() || modelId;
}
