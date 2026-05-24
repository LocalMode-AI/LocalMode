/**
 * LiteRT Utilities
 *
 * Helper functions for LiteRT model management and browser compatibility checks.
 *
 * @packageDocumentation
 */

import { isWASMSupported } from '@localmode/core';
import type { LiteRTLoadProgress, LiteRTBrowserCompat } from './types.js';
import { LITERT_MODELS, type LiteRTModelId } from './models.js';

/** Cached result of WebGPU usability detection. */
let webGpuUsableCache: boolean | null = null;

/**
 * Reset the cached WebGPU usability result. Useful for tests, or after the
 * user has explicitly enabled WebGPU in browser flags and wants to retry.
 */
export function resetWebGPUUsableCache(): void {
  webGpuUsableCache = null;
}

/**
 * Aggressive WebGPU check that actually attempts to create a device.
 *
 * Some browsers (notably Playwright/headless Chromium) expose `navigator.gpu`
 * and return a non-null adapter from `requestAdapter()` yet hang or fail when
 * an actual device is requested — sometimes `requestAdapter()` itself never
 * resolves. LiteRT-LM's `setupDefaultWebGpuDevice()` then never resolves, so
 * we have to verify device creation up-front with hard timeouts.
 *
 * This intentionally does NOT call `@localmode/core`'s `isWebGPUSupported()`
 * because that helper awaits `requestAdapter()` without a timeout and can
 * hang indefinitely in headless environments.
 *
 * @returns Promise resolving to true if a WebGPU device can actually be created.
 */
export async function isWebGPUDeviceUsable(): Promise<boolean> {
  if (webGpuUsableCache !== null) return webGpuUsableCache;
  try {
    const nav = (globalThis as { navigator?: { gpu?: { requestAdapter: () => Promise<unknown> } } }).navigator;
    if (!nav || !nav.gpu || typeof nav.gpu.requestAdapter !== 'function') {
      webGpuUsableCache = false;
      return false;
    }
    // Race adapter request against a 3s timeout so a hung adapter call
    // doesn't block the whole load forever.
    const adapter = await Promise.race([
      nav.gpu.requestAdapter(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    if (!adapter || typeof (adapter as { requestDevice?: unknown }).requestDevice !== 'function') {
      webGpuUsableCache = false;
      return false;
    }
    const device = await Promise.race([
      (adapter as { requestDevice: () => Promise<unknown> }).requestDevice(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    if (device && typeof (device as { destroy?: () => void }).destroy === 'function') {
      try { (device as { destroy: () => void }).destroy(); } catch { /* ignore */ }
    }
    webGpuUsableCache = !!device;
    return webGpuUsableCache;
  } catch {
    webGpuUsableCache = false;
    return false;
  }
}

/** Base URL for HuggingFace model file resolution */
const HF_BASE_URL = 'https://huggingface.co';

/** Cache name used for LiteRT model files in the Cache API */
const CACHE_NAME = 'litert-models';

/**
 * Resolve a model ID to a full download URL.
 *
 * Accepts either:
 * - Full URL: `https://huggingface.co/repo/model/resolve/main/model.task`
 * - Shorthand: `repo/model:filename.task`
 * - Catalog key: looked up against LITERT_MODELS
 *
 * @param modelId - Model identifier or URL
 * @param modelUrl - Optional explicit URL override
 * @returns Full download URL
 *
 * @example
 * ```ts
 * import { resolveModelUrl } from '@localmode/litert';
 *
 * // Catalog key
 * const url1 = resolveModelUrl('gemma-4-E2B');
 *
 * // HuggingFace shorthand
 * const url2 = resolveModelUrl('google/gemma-3n-E4B-it-litert-preview:gemma3n-E4B-it-multi-device.task');
 *
 * // Full URL passthrough
 * const url3 = resolveModelUrl('https://example.com/model.task');
 * ```
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

  // Shorthand format: "repo/name:filename.task"
  if (modelId.includes(':')) {
    const [repoPath, filename] = modelId.split(':');
    return `${HF_BASE_URL}/${repoPath}/resolve/main/${filename}`;
  }

  // Check the built-in catalog for a known URL
  const catalogEntry = LITERT_MODELS[modelId as LiteRTModelId];
  if (catalogEntry) {
    return catalogEntry.url;
  }

  // Try as a HuggingFace repo path (assume main branch, derive filename from ID)
  return `${HF_BASE_URL}/${modelId}/resolve/main/`;
}

/**
 * Check if a LiteRT model is cached in the browser.
 *
 * Uses the Cache API (`litert-models` cache) to check if the model URL
 * has been previously downloaded. Returns `false` if the Cache API is not
 * available (e.g., insecure context, unsupported browser).
 *
 * @param modelId - The model ID to check
 * @returns Promise resolving to `true` if the model is cached
 *
 * @example
 * ```ts
 * import { isModelCached } from '@localmode/litert';
 *
 * if (await isModelCached('gemma-4-E2B')) {
 *   console.log('Model already downloaded!');
 * }
 * ```
 */
export async function isModelCached(modelId: string): Promise<boolean> {
  try {
    if (typeof caches === 'undefined') {
      return false;
    }
    const url = resolveModelUrl(modelId);
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(url);
    return response !== undefined;
  } catch {
    return false;
  }
}

/**
 * Preload a LiteRT model into the browser cache.
 *
 * Downloads the model and initializes a LiteRT engine to validate it,
 * then destroys the engine to release memory. The model remains cached
 * for instant use on subsequent loads.
 *
 * @param modelId - The model ID to preload
 * @param options - Preload options
 * @param options.onProgress - Callback invoked with download progress updates
 * @param options.modelUrl - Explicit URL override (bypasses ID-based resolution)
 * @returns Promise that resolves when the model is cached
 * @throws {Error} If the model fails to download or initialize
 *
 * @example
 * ```ts
 * import { preloadModel } from '@localmode/litert';
 *
 * await preloadModel('gemma-4-E2B', {
 *   onProgress: (p) => console.log(`Loading: ${p.progress}%`),
 * });
 * ```
 */
export async function preloadModel(
  modelId: string,
  options?: {
    onProgress?: (progress: LiteRTLoadProgress) => void;
    modelUrl?: string;
  }
): Promise<void> {
  const url = resolveModelUrl(modelId, options?.modelUrl);

  options?.onProgress?.({
    status: 'initiate',
    progress: 0,
    text: 'Initializing LiteRT engine',
  });

  // Fetch the model with explicit progress tracking so the UI can show real
  // download progress. The Engine accepts a ReadableStream as its `model`.
  const stream = await fetchModelStream(url, options?.onProgress);

  const { Engine, Backend } = await import('@litert-lm/core');

  options?.onProgress?.({
    status: 'progress',
    progress: 95,
    text: 'Initializing model',
  });

  // Let LiteRT-LM pick its default backend (WebGPU when available). If the
  // pinned build cannot stream-load this model on the GPU backend, retry once
  // on the CPU backend.
  let engine: Awaited<ReturnType<typeof Engine.create>>;
  try {
    engine = await Engine.create({ model: stream });
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    if (/Streaming\s.*is not supported yet/i.test(msg)) {
      options?.onProgress?.({
        status: 'progress',
        progress: 95,
        text: 'GPU streaming unsupported for this model — retrying on CPU',
      });
      const retryStream = await fetchModelStream(url, undefined);
      engine = await Engine.create({ model: retryStream, backend: Backend.CPU });
    } else {
      throw err;
    }
  }

  options?.onProgress?.({ status: 'done', progress: 100, text: 'Model loaded' });
  options?.onProgress?.({ status: 'ready', progress: 100, text: 'Model cached successfully' });

  // Best-effort: persist to the Cache API so the next session loads instantly.
  try {
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(url);
      if (!cached) {
        const resp = await fetch(url);
        if (resp.ok) {
          await cache.put(url, resp);
        }
      }
    }
  } catch {
    // Cache API failures are non-fatal.
  }

  // Model is cached now; release memory.
  await engine.delete();
}

/**
 * Fetch a `.litertlm` model URL, returning a ReadableStream and emitting
 * real-time download progress to the provided callback.
 *
 * Reads the `Content-Length` header so progress can be reported as a percentage.
 * If the header is missing, progress is reported as bytes-downloaded only.
 */
export async function fetchModelStream(
  url: string,
  onProgress?: (progress: LiteRTLoadProgress) => void
): Promise<ReadableStream<Uint8Array>> {
  // Try Cache API first for instant re-load on subsequent sessions.
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(url);
      if (cached && cached.body) {
        onProgress?.({
          status: 'done',
          progress: 100,
          text: 'Loaded from cache',
        });
        return cached.body;
      }
    } catch {
      // Continue to network fetch.
    }
  }

  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch model file from ${url}: HTTP ${response.status} ${response.statusText}`
    );
  }
  if (!response.body) {
    throw new Error(`Response body is null for ${url}`);
  }

  const totalHeader = response.headers.get('Content-Length');
  const total = totalHeader ? Number(totalHeader) : 0;
  const reader = response.body.getReader();
  let loaded = 0;

  const progressStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            loaded += value.byteLength;
            controller.enqueue(value);
            if (onProgress) {
              const pct = total > 0 ? Math.min(95, (loaded / total) * 95) : 0;
              onProgress({
                status: 'download',
                progress: pct,
                loaded,
                total: total || undefined,
                text: total > 0
                  ? `Downloading model: ${(loaded / 1_048_576).toFixed(0)} / ${(total / 1_048_576).toFixed(0)} MB`
                  : `Downloading model: ${(loaded / 1_048_576).toFixed(0)} MB`,
              });
            }
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });

  return progressStream;
}

/**
 * Delete a cached LiteRT model from the browser.
 *
 * Removes the model URL entry from the `litert-models` Cache API store.
 * Warns on failure instead of throwing, so callers don't need error handling
 * for cache cleanup.
 *
 * @param modelId - The model ID to delete from cache
 * @returns Promise that resolves when the cache entry is removed
 *
 * @example
 * ```ts
 * import { deleteModelCache } from '@localmode/litert';
 *
 * await deleteModelCache('gemma-4-E2B');
 * console.log('Model cache cleared!');
 * ```
 */
export async function deleteModelCache(modelId: string): Promise<void> {
  try {
    if (typeof caches === 'undefined') {
      return;
    }
    const url = resolveModelUrl(modelId);
    const cache = await caches.open(CACHE_NAME);
    await cache.delete(url);
  } catch (error) {
    console.warn(`Failed to delete cache for ${modelId}:`, error);
  }
}

/**
 * Check browser compatibility for LiteRT inference.
 *
 * Inspects WebGPU availability, device RAM, and WASM support to determine
 * which inference backend can be used. Returns warnings and actionable
 * recommendations for suboptimal environments.
 *
 * @returns Promise resolving to a compatibility report
 *
 * @example
 * ```ts
 * import { checkLiteRTBrowserCompat } from '@localmode/litert';
 *
 * const compat = await checkLiteRTBrowserCompat();
 * if (!compat.canRun) {
 *   console.error('LiteRT not supported:', compat.warnings);
 * } else {
 *   console.log(`Using ${compat.backend} backend (${compat.deviceRAMHuman} RAM)`);
 * }
 * ```
 */
export async function checkLiteRTBrowserCompat(): Promise<LiteRTBrowserCompat> {
  const warnings: string[] = [];
  const recommendations: string[] = [];

  // Check WebGPU — uses our robust device-usable probe with timeouts
  const hasWebGPU = await isWebGPUDeviceUsable();

  // Check device RAM (Chrome/Edge expose navigator.deviceMemory in GB)
  let deviceRAM: number | null = null;
  if (typeof navigator !== 'undefined' && 'deviceMemory' in navigator) {
    const memGB = (navigator as { deviceMemory?: number }).deviceMemory;
    if (memGB !== undefined) {
      deviceRAM = memGB * 1024 * 1024 * 1024; // Convert GB to bytes
    }
  }

  // Fallback: assume 4GB if unavailable
  const effectiveRAMGB = deviceRAM !== null ? deviceRAM / (1024 * 1024 * 1024) : 4;

  // Format human-readable RAM
  const deviceRAMHuman =
    deviceRAM !== null ? `${effectiveRAMGB} GB` : '4 GB (estimated)';

  // Check WASM support
  const hasWASM = isWASMSupported();

  // Determine backend
  let backend: 'GPU' | 'CPU' | 'none';
  if (hasWebGPU) {
    backend = 'GPU';
  } else if (hasWASM) {
    backend = 'CPU';
  } else {
    backend = 'none';
  }

  // Can run if we have at least WASM
  const canRun = backend !== 'none';

  // Build warnings
  if (!hasWebGPU) {
    warnings.push(
      'WebGPU not available — falling back to CPU inference (significantly slower)'
    );
  }

  if (effectiveRAMGB < 4) {
    warnings.push(
      `Low device RAM (${effectiveRAMGB} GB) — larger models may fail to load`
    );
  }

  if (!hasWASM) {
    warnings.push('WebAssembly not supported — LiteRT cannot run in this browser');
  }

  // Build recommendations
  if (!hasWebGPU) {
    recommendations.push(
      'Use Chrome 113+ or Edge 113+ for WebGPU-accelerated inference'
    );
  }

  if (effectiveRAMGB < 4) {
    recommendations.push(
      'Use smaller models (e.g., gemma-4-E2B) or close other tabs to free memory'
    );
  }

  if (backend === 'CPU') {
    recommendations.push(
      'CPU inference is functional but 5-10x slower than GPU — consider upgrading your browser'
    );
  }

  return {
    canRun,
    hasWebGPU,
    backend,
    deviceRAM,
    deviceRAMHuman,
    warnings,
    recommendations,
  };
}
