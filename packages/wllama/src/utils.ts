/**
 * wllama Utilities
 *
 * Helper functions for wllama model management and CORS detection.
 *
 * @packageDocumentation
 */

import type { WllamaLoadProgress } from './types.js';
import { WLLAMA_MODELS, type WllamaModelId } from './models.js';

/** Base URL for HuggingFace model file resolution */
const HF_BASE_URL = 'https://huggingface.co';

/**
 * Check if the current page has Cross-Origin Isolation.
 *
 * Cross-origin isolation enables `SharedArrayBuffer`, which is required
 * for multi-threaded WASM execution. Without it, wllama falls back to
 * single-threaded mode (~2-4x slower).
 *
 * @returns `true` if `SharedArrayBuffer` is available
 *
 * @example
 * ```ts
 * import { isCrossOriginIsolated } from '@localmode/wllama';
 *
 * if (isCrossOriginIsolated()) {
 *   console.log('Multi-threading available');
 * } else {
 *   console.log('Single-thread fallback (add CORS headers for 2-4x speed)');
 * }
 * ```
 */
export function isCrossOriginIsolated(): boolean {
  // Check the standard API first
  if (typeof globalThis.crossOriginIsolated === 'boolean') {
    return globalThis.crossOriginIsolated;
  }
  // Fallback: check if SharedArrayBuffer is defined
  return typeof SharedArrayBuffer !== 'undefined';
}

/**
 * Resolve a model ID to a full download URL.
 *
 * Accepts either:
 * - Full URL: `https://huggingface.co/repo/model/resolve/main/file.gguf`
 * - Shorthand: `repo/model:filename.gguf`
 * - Catalog key: looked up against WLLAMA_MODELS
 *
 * @param modelId - Model identifier or URL
 * @param modelUrl - Optional explicit URL override
 * @returns Full download URL
 *
 * @internal
 */
export function resolveModelUrl(modelId: string, modelUrl?: string): string {
  // Explicit URL override
  if (modelUrl) {
    return modelUrl;
  }

  // Already a full URL
  if (modelId.startsWith('http://') || modelId.startsWith('https://')) {
    return modelId;
  }

  // Shorthand format: "repo/name:filename.gguf"
  if (modelId.includes(':')) {
    const [repoPath, filename] = modelId.split(':');
    return `${HF_BASE_URL}/${repoPath}/resolve/main/${filename}`;
  }

  // Check the built-in catalog for a known URL
  const catalogEntry = WLLAMA_MODELS[modelId as WllamaModelId];
  if (catalogEntry) {
    return catalogEntry.url;
  }

  // Try as a HuggingFace repo path (assume main branch, derive filename from ID)
  return `${HF_BASE_URL}/${modelId}/resolve/main/`;
}

/**
 * Convert a URL to an OPFS filename matching wllama's CacheManager format.
 *
 * Format: `${SHA-1(url)}_${lastPathSegment}`
 *
 * @param url - The full model URL
 * @returns The OPFS filename
 *
 * @internal
 */
async function urlToOPFSFileName(url: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    'SHA-1',
    new TextEncoder().encode(url)
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hashHex}_${url.split('/').pop()}`;
}

/**
 * Check if a GGUF model is cached in the browser.
 *
 * wllama stores models in OPFS (Origin Private File System), not the Cache API.
 *
 * @param modelId - The model ID to check
 * @returns Promise<boolean> indicating if the model is cached
 *
 * @example
 * ```ts
 * import { isModelCached } from '@localmode/wllama';
 *
 * if (await isModelCached('bartowski/Llama-3.2-1B-Instruct-GGUF:Llama-3.2-1B-Instruct-Q4_K_M.gguf')) {
 *   console.log('Model already downloaded!');
 * }
 * ```
 */
export async function isModelCached(modelId: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
      return false;
    }
    const url = resolveModelUrl(modelId);
    const fileName = await urlToOPFSFileName(url);
    const opfsRoot = await navigator.storage.getDirectory();
    const cacheDir = await opfsRoot.getDirectoryHandle('cache', { create: false });
    const fileHandle = await cacheDir.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return file.size > 0;
  } catch {
    return false;
  }
}

/**
 * Preload a GGUF model into the browser cache.
 *
 * Downloads the model without running inference, so it's ready for instant use later.
 *
 * @param modelId - The model ID to preload
 * @param options - Preload options
 * @returns Promise that resolves when model is cached
 *
 * @example
 * ```ts
 * import { preloadModel } from '@localmode/wllama';
 *
 * await preloadModel('bartowski/Llama-3.2-1B-Instruct-GGUF:Llama-3.2-1B-Instruct-Q4_K_M.gguf', {
 *   onProgress: (p) => console.log(`Loading: ${p.progress}%`),
 * });
 * ```
 */
export async function preloadModel(
  modelId: string,
  options?: {
    onProgress?: (progress: WllamaLoadProgress) => void;
    modelUrl?: string;
  }
): Promise<void> {
  const dynamicImport = new Function('u', 'return import(u)') as (url: string) => Promise<{ Wllama: new (config: { default: string }) => { loadModelFromUrl: (url: string, opts: Record<string, unknown>) => Promise<void>; exit: () => Promise<void> } }>;
  const { Wllama } = await dynamicImport('https://cdn.jsdelivr.net/npm/@wllama/wllama@3.2.3/esm/index.js');

  const url = resolveModelUrl(modelId, options?.modelUrl);

  const wllamaInstance = new Wllama({
    default: 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.2.3/src/wasm/wllama.wasm',
  });

  const numThreads = isCrossOriginIsolated()
    ? (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 1)
    : 1;

  await wllamaInstance.loadModelFromUrl(url, {
    n_threads: numThreads,
    progressCallback: (opts: { loaded: number; total: number }) => {
      if (options?.onProgress) {
        const pct = opts.total > 0 ? (opts.loaded / opts.total) * 100 : 0;
        const progress: WllamaLoadProgress = {
          status: pct >= 100 ? 'done' : 'download',
          progress: Math.min(pct, 100),
          loaded: opts.loaded,
          total: opts.total,
        };
        options.onProgress(progress);
      }
    },
  });

  // Model is cached now, release memory
  await wllamaInstance.exit();
}

/**
 * Delete a cached GGUF model from the browser.
 *
 * @param modelId - The model ID to delete
 * @returns Promise that resolves when cache is cleared
 *
 * @example
 * ```ts
 * import { deleteModelCache } from '@localmode/wllama';
 *
 * await deleteModelCache('bartowski/Llama-3.2-1B-Instruct-GGUF:Llama-3.2-1B-Instruct-Q4_K_M.gguf');
 * console.log('Model cache cleared!');
 * ```
 */
export async function deleteModelCache(modelId: string): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
      return;
    }
    const url = resolveModelUrl(modelId);
    const fileName = await urlToOPFSFileName(url);
    const opfsRoot = await navigator.storage.getDirectory();
    const cacheDir = await opfsRoot.getDirectoryHandle('cache', { create: false });
    // Delete both the model file and its metadata file
    await cacheDir.removeEntry(fileName).catch(() => {});
    await cacheDir.removeEntry(`__metadata__${fileName}`).catch(() => {});
  } catch (error) {
    console.warn(`Failed to delete cache for ${modelId}:`, error);
  }
}

/**
 * List all cached GGUF models in the browser.
 *
 * @returns Array of cached model metadata (url, size)
 *
 * @example
 * ```ts
 * import { listCachedModels } from '@localmode/wllama';
 *
 * const models = await listCachedModels();
 * console.log(`${models.length} models cached`);
 * ```
 */
export async function listCachedModels(): Promise<Array<{ name: string; size: number }>> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
      return [];
    }
    const opfsRoot = await navigator.storage.getDirectory();
    const cacheDir = await opfsRoot.getDirectoryHandle('cache', { create: false });
    const entries: Array<{ name: string; size: number }> = [];
    for await (const [name, handle] of (cacheDir as unknown as AsyncIterable<[string, FileSystemFileHandle]>)) {
      if (name.startsWith('__metadata__')) continue;
      if (handle.kind === 'file') {
        const file = await (handle as FileSystemFileHandle).getFile();
        entries.push({ name, size: file.size });
      }
    }
    return entries;
  } catch {
    return [];
  }
}

/**
 * Clear all cached GGUF models from the browser.
 *
 * @returns Promise that resolves when all cache is cleared
 *
 * @example
 * ```ts
 * import { clearAllModelCache } from '@localmode/wllama';
 *
 * await clearAllModelCache();
 * console.log('All model cache cleared!');
 * ```
 */
export async function clearAllModelCache(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
      return;
    }
    const opfsRoot = await navigator.storage.getDirectory();
    await opfsRoot.removeEntry('cache', { recursive: true });
  } catch {
    // Cache directory may not exist
  }
}

/**
 * Re-download a cached model, replacing any corrupted cache.
 *
 * @param modelId - The model ID to refresh
 * @param options - Progress callback and optional URL override
 *
 * @example
 * ```ts
 * import { refreshModel } from '@localmode/wllama';
 *
 * await refreshModel('SmolLM2-135M-Instruct-Q4_K_M', {
 *   onProgress: (p) => console.log(`${p.progress}%`),
 * });
 * ```
 */
export async function refreshModel(
  modelId: string,
  options?: {
    onProgress?: (progress: WllamaLoadProgress) => void;
    modelUrl?: string;
  }
): Promise<void> {
  await deleteModelCache(modelId);
  await preloadModel(modelId, options);
}
