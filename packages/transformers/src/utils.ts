/**
 * Transformers Utilities
 *
 * Utility functions for the Transformers.js provider.
 *
 * @packageDocumentation
 */

import type { ModelLoadProgress } from './types.js';
import { TRANSFORMERS_LLM_MODELS } from './models.js';
import { installResilientModelCache } from './resilient-cache.js';

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
    /**
     * Execution device for the throwaway session that triggers the download.
     * Language models default to WebGPU when the browser exposes an adapter,
     * else WASM, so a preload never fails on a WebGPU-less browser; other
     * pipelines keep Transformers.js's own default unless a device is given.
     * Pass the device the model will actually run on so the cached artifacts
     * match it.
     */
    device?: 'webgpu' | 'wasm';
  }
): Promise<void> {
  const { pipeline, env } = await import('@huggingface/transformers');
  installResilientModelCache(env);

  const device =
    options?.device ??
    (typeof navigator !== 'undefined' && 'gpu' in navigator && navigator.gpu !== undefined
      ? 'webgpu'
      : 'wasm');

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

  // The session built here exists only to populate the cache. It MUST be
  // disposed: ONNX Runtime's WASM heap never shrinks, so a leaked session
  // stays resident for the page lifetime and later session creations fail
  // with std::bad_alloc once a few models have been preloaded.
  const disposeOf = async (handle: unknown): Promise<void> => {
    const d = (handle as { dispose?: () => Promise<void> | void } | null)?.dispose;
    if (typeof d === 'function') await d.call(handle);
  };

  // LLM models use different loading strategies
  const isLLMModel = modelId in TRANSFORMERS_LLM_MODELS;
  if (isLLMModel) {
    const tjs = await import('@huggingface/transformers');
    const lower = modelId.toLowerCase();
    const isQwen35 = lower.includes('qwen3.5') || lower.includes('qwen3_5') || lower.includes('qwen35');

    if (isQwen35) {
      const [, model] = await Promise.all([
        tjs.AutoTokenizer.from_pretrained(modelId, {
          progress_callback: progressCallback,
        } as Record<string, unknown>),
        tjs.AutoModelForCausalLM.from_pretrained(modelId, {
          dtype: { embed_tokens: 'q4', vision_encoder: 'q4', decoder_model_merged: 'q4' },
          device,
          progress_callback: progressCallback,
        } as Record<string, unknown>),
      ]);
      await disposeOf(model);
    } else {
      const pipe = await tjs.pipeline('text-generation', modelId, {
        device,
        dtype: 'q4',
        progress_callback: progressCallback,
      } as Record<string, unknown>);
      await disposeOf(pipe);
    }
    return;
  }

  // Create pipeline options
  const pipelineOptions: Record<string, unknown> = {
    progress_callback: progressCallback,
  };

  // Add quantized option if specified
  if (options?.quantized !== undefined) {
    pipelineOptions.dtype = options.quantized ? 'q8' : 'fp32';
  }
  // Only an explicit device is forwarded here: non-LLM preloads keep
  // Transformers.js's own default so existing callers' preloads are unchanged.
  if (options?.device) pipelineOptions.device = options.device;

  const pipe = await pipeline(task as Parameters<typeof pipeline>[0], modelId, pipelineOptions);
  await disposeOf(pipe);
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
