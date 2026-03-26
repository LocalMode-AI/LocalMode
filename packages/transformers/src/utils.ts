/**
 * Transformers Utilities
 *
 * Utility functions for the Transformers.js provider.
 *
 * @packageDocumentation
 */

import type { ModelLoadProgress } from './types.js';
import { TRANSFORMERS_LLM_MODELS } from './models.js';

/**
 * Check if WebGPU is available in the current environment.
 *
 * @returns Promise<boolean> True if WebGPU is available
 *
 * @example
 * ```ts
 * if (await isWebGPUAvailable()) {
 *   console.log('Using WebGPU for acceleration');
 * } else {
 *   console.log('Falling back to WASM');
 * }
 * ```
 */
export async function isWebGPUAvailable(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    return false;
  }

  try {
    // Type assertion needed as GPU types may not be available in all TypeScript configs
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) return false;
    const adapter = await gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

/**
 * Get the optimal device based on environment capabilities.
 *
 * @returns Promise with the recommended device type
 */
export async function getOptimalDevice(): Promise<'webgpu' | 'wasm'> {
  if (await isWebGPUAvailable()) {
    return 'webgpu';
  }
  return 'wasm';
}

/**
 * Check if a model is already cached locally.
 *
 * @param modelId - The model ID to check
 * @returns Promise<boolean> True if the model is cached
 *
 * @example
 * ```ts
 * if (await isModelCached('Xenova/bge-small-en-v1.5')) {
 *   console.log('Model is ready');
 * } else {
 *   console.log('Model will be downloaded on first use');
 * }
 * ```
 */
export async function isModelCached(modelId: string): Promise<boolean> {
  // Check if we're in a browser environment with Cache API
  if (typeof caches === 'undefined') {
    return false;
  }

  try {
    // Transformers.js uses a specific cache name
    const cache = await caches.open('transformers-cache');
    const keys = await cache.keys();

    // Check if any cached resources match this model ID in the URL path
    return keys.some((request) => request.url.includes(modelId));
  } catch {
    return false;
  }
}

/**
 * Preload a model to cache it for offline use.
 *
 * This downloads and caches the model without actually using it,
 * allowing for faster subsequent loads.
 *
 * @param modelId - The model ID to preload
 * @param options - Preload options
 *
 * @example
 * ```ts
 * // Preload during app initialization
 * await preloadModel('Xenova/bge-small-en-v1.5', {
 *   onProgress: (p) => console.log(`${p.progress}%`),
 * });
 * ```
 */
export async function preloadModel(
  modelId: string,
  options?: {
    onProgress?: (progress: ModelLoadProgress) => void;
    quantized?: boolean;
  }
): Promise<void> {
  const { pipeline } = await import('@huggingface/transformers');

  // Determine the task type from the model ID
  // This is a heuristic - in practice, users should know which task they need
  let task: string = 'feature-extraction';

  if (modelId.toLowerCase().includes('whisper')) {
    task = 'automatic-speech-recognition';
  } else if (modelId.toLowerCase().includes('blip') || modelId.toLowerCase().includes('caption')) {
    task = 'image-to-text';
  } else if (modelId.toLowerCase().includes('clip')) {
    task = 'zero-shot-image-classification';
  } else if (modelId.toLowerCase().includes('vit') || modelId.toLowerCase().includes('resnet')) {
    task = 'image-classification';
  } else if (modelId.toLowerCase().includes('ner') || modelId.toLowerCase().includes('token')) {
    task = 'token-classification';
  } else if (
    modelId.toLowerCase().includes('mnli') ||
    modelId.toLowerCase().includes('nli') ||
    modelId.toLowerCase().includes('bart')
  ) {
    task = 'zero-shot-classification';
  } else if (
    modelId.toLowerCase().includes('sst') ||
    modelId.toLowerCase().includes('sentiment') ||
    modelId.toLowerCase().includes('distilbert')
  ) {
    task = 'text-classification';
  } else if (modelId.toLowerCase().includes('rerank') || modelId.toLowerCase().includes('marco')) {
    task = 'text-classification'; // Rerankers often use text-classification pipeline
  }

  // Create pipeline to trigger download
  const progressCallback = options?.onProgress
    ? (progressInfo: {
        status: string;
        name?: string;
        file?: string;
        progress?: number;
        loaded?: number;
        total?: number;
      }) => {
        // Forward all progress events
        options.onProgress?.({
          status: progressInfo.status as ModelLoadProgress['status'],
          name: progressInfo.name,
          file: progressInfo.file,
          progress: progressInfo.progress,
          loaded: progressInfo.loaded,
          total: progressInfo.total,
        });
      }
    : undefined;

  // LLM models use @huggingface/transformers-v4 with different loading
  const isLLMModel = modelId in TRANSFORMERS_LLM_MODELS;
  if (isLLMModel) {
    const tjs4 = await import('@huggingface/transformers-v4');
    const lower = modelId.toLowerCase();
    const isQwen35 = lower.includes('qwen3.5') || lower.includes('qwen3_5') || lower.includes('qwen35');

    if (isQwen35) {
      await Promise.all([
        tjs4.AutoTokenizer.from_pretrained(modelId, {
          progress_callback: progressCallback,
        } as Record<string, unknown>),
        tjs4.AutoModelForCausalLM.from_pretrained(modelId, {
          dtype: { embed_tokens: 'q4', vision_encoder: 'q4', decoder_model_merged: 'q4' },
          device: 'webgpu',
          progress_callback: progressCallback,
        } as Record<string, unknown>),
      ]);
    } else {
      await tjs4.pipeline('text-generation', modelId, {
        device: 'webgpu',
        dtype: 'q4',
        progress_callback: progressCallback,
      } as Record<string, unknown>);
    }
    return;
  }

  // Create pipeline options - use type assertion as API may vary between versions
  const pipelineOptions: Record<string, unknown> = {
    progress_callback: progressCallback,
  };

  // Add quantized option if specified
  if (options?.quantized !== undefined) {
    pipelineOptions.dtype = options.quantized ? 'q8' : 'fp32';
  }

  await pipeline(task as Parameters<typeof pipeline>[0], modelId, pipelineOptions);
}

/**
 * Clear all cached models from the browser.
 *
 * @returns Promise<boolean> True if cache was cleared successfully
 */
export async function clearModelCache(): Promise<boolean> {
  if (typeof caches === 'undefined') {
    return false;
  }

  try {
    return await caches.delete('transformers-cache');
  } catch {
    return false;
  }
}

/**
 * Get an estimate of cached model storage usage.
 *
 * @returns Promise with storage estimate in bytes
 */
export async function getModelStorageUsage(): Promise<number> {
  if (typeof navigator === 'undefined' || !('storage' in navigator)) {
    return 0;
  }

  try {
    const estimate = await navigator.storage.estimate();
    return estimate.usage ?? 0;
  } catch {
    return 0;
  }
}
