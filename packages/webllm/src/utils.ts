/**
 * WebLLM Utilities
 *
 * Helper functions for WebLLM model management.
 *
 * @packageDocumentation
 */

import type { WebLLMLoadProgress } from './types.js';

/**
 * Check if a model is cached in the browser.
 *
 * @param modelId - The model ID to check
 * @returns Promise<boolean> indicating if the model is cached
 *
 * @example
 * ```ts
 * import { isModelCached } from '@localmode/webllm';
 *
 * if (await isModelCached('Llama-3.2-1B-Instruct-q4f16')) {
 *   console.log('Model already downloaded!');
 * }
 * ```
 */
export async function isModelCached(modelId: string): Promise<boolean> {
  try {
    const { hasModelInCache } = await import('@mlc-ai/web-llm');
    return await hasModelInCache(modelId);
  } catch {
    return false;
  }
}

/**
 * Preload a model into the browser cache.
 *
 * @param modelId - The model ID to preload
 * @param options - Preload options
 * @returns Promise that resolves when model is loaded
 *
 * @example
 * ```ts
 * import { preloadModel } from '@localmode/webllm';
 *
 * await preloadModel('Llama-3.2-1B-Instruct-q4f16', {
 *   onProgress: (p) => console.log(`Loading: ${p.progress}%`),
 * });
 * ```
 */
export async function preloadModel(
  modelId: string,
  options?: {
    onProgress?: (progress: WebLLMLoadProgress) => void;
  }
): Promise<void> {
  const { CreateMLCEngine } = await import('@mlc-ai/web-llm');

  const engine = await CreateMLCEngine(modelId, {
    initProgressCallback: (report) => {
      if (options?.onProgress) {
        const progress: WebLLMLoadProgress = {
          status: report.progress === 1 ? 'done' : 'progress',
          progress: report.progress * 100,
          text: report.text,
        };
        options.onProgress(progress);
      }
    },
  });

  // Engine is loaded, we can unload it now (model stays cached)
  await engine.unload();
}

/**
 * Delete a cached model from the browser.
 *
 * @param modelId - The model ID to delete
 * @returns Promise that resolves when model is deleted
 *
 * @example
 * ```ts
 * import { deleteModelCache } from '@localmode/webllm';
 *
 * await deleteModelCache('Llama-3.2-1B-Instruct-q4f16');
 * console.log('Model cache cleared!');
 * ```
 */
export async function deleteModelCache(modelId: string): Promise<void> {
  try {
    // WebLLM stores models in Cache API - attempt to clear
    const caches = await globalThis.caches.keys();
    for (const cacheName of caches) {
      if (cacheName.includes(modelId) || cacheName.includes('webllm')) {
        await globalThis.caches.delete(cacheName);
      }
    }
  } catch (error) {
    console.warn(`Failed to delete cache for ${modelId}:`, error);
  }
}

/**
 * Get estimated model size in bytes.
 *
 * @param modelId - The model ID
 * @returns Estimated size in bytes, or undefined if unknown
 */
export function getModelSize(modelId: string): number | undefined {
  const sizes: Record<string, number> = {
    'Llama-3.2-1B-Instruct-q4f16': 700 * 1024 * 1024,
    'Llama-3.2-3B-Instruct-q4f16': 1800 * 1024 * 1024,
    'Phi-3.5-mini-instruct-q4f16': 2400 * 1024 * 1024,
    'Qwen2.5-1.5B-Instruct-q4f16': 1000 * 1024 * 1024,
    'Qwen2.5-3B-Instruct-q4f16': 2000 * 1024 * 1024,
    'SmolLM2-1.7B-Instruct-q4f16': 1100 * 1024 * 1024,
    'gemma-2-2b-it-q4f16_1': 1500 * 1024 * 1024,
  };

  return sizes[modelId];
}

/**
 * Check if WebGPU is available for WebLLM.
 *
 * @returns Promise<boolean> indicating if WebGPU is available
 */
export async function isWebGPUAvailable(): Promise<boolean> {
  if (typeof navigator === 'undefined') {
    return false;
  }

  if (!('gpu' in navigator)) {
    return false;
  }

  try {
    // Use type assertion to access WebGPU API which may not have types in all environments
    const gpu = (navigator as unknown as { gpu: { requestAdapter: () => Promise<unknown | null> } }).gpu;
    const adapter = await gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

