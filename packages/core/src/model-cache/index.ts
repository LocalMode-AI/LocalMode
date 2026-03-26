/**
 * Model Cache
 *
 * Chunked model download cache with LRU eviction. Downloads ML model files,
 * stores them in IndexedDB as fixed-size chunks, and evicts least-recently-used
 * models when the cache exceeds its configured size limit.
 *
 * @example
 * ```typescript
 * import { createModelLoader } from '@localmode/core';
 *
 * const loader = createModelLoader({
 *   maxCacheSize: '2GB',
 *   chunkSize: 16 * 1024 * 1024, // 16 MB
 *   onProgress: (modelId, progress) => {
 *     console.log(`${modelId}: ${(progress.progress * 100).toFixed(1)}%`);
 *   },
 * });
 *
 * // Prefetch models
 * await loader.prefetch([
 *   { url: 'https://huggingface.co/.../model.onnx', modelId: 'bge-small-en' },
 * ]);
 *
 * // Retrieve as Blob
 * const blob = await loader.getBlob('bge-small-en');
 *
 * // Cleanup
 * await loader.destroy();
 * ```
 *
 * @packageDocumentation
 */

import { LockManager } from '../sync/locks.js';
import { ChunkedModelStore } from './chunked-store.js';
import { DownloadManager } from './download-manager.js';
import { LRUTracker } from './lru-tracker.js';

import type {
  ModelLoader,
  ModelLoaderConfig,
  ModelDownloadRequest,
  PrefetchOptions,
  CacheEntry,
} from './types.js';

// ============================================================================
// Re-exports
// ============================================================================

export type {
  ModelLoader,
  ModelLoaderConfig,
  ModelDownloadProgress,
  ModelDownloadRequest,
  PrefetchOptions,
  CacheEntry,
  ModelMetadataRecord,
} from './types.js';

// ============================================================================
// Defaults
// ============================================================================

/** Default cache name. */
const DEFAULT_CACHE_NAME = 'localmode-model-cache';

/** Default maximum cache size: 2 GB. */
const DEFAULT_MAX_CACHE_SIZE = 2 * 1024 * 1024 * 1024; // 2147483648

/** Default chunk size: 16 MB. */
const DEFAULT_CHUNK_SIZE = 16 * 1024 * 1024; // 16777216

/** Default maximum retries per chunk. */
const DEFAULT_MAX_RETRIES = 3;

/** Default base retry delay. */
const DEFAULT_RETRY_DELAY_MS = 1000;

// ============================================================================
// Size Parser
// ============================================================================

/**
 * Parse a human-readable size string (e.g. `'2GB'`, `'512MB'`) into bytes.
 * If a number is passed, it is returned as-is.
 *
 * @param size - Size as a number (bytes) or string with unit
 * @returns Size in bytes
 */
function parseSize(size: string | number): number {
  if (typeof size === 'number') return size;

  const match = size.match(/^([\d.]+)\s*(GB|MB|KB|B)$/i);
  if (!match) return parseInt(size, 10);

  const [, num, unit] = match;
  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
  };

  return Math.round(parseFloat(num) * multipliers[unit.toUpperCase()]);
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new {@link ModelLoader} instance.
 *
 * The loader downloads ML model files, splits them into chunks, and stores
 * them in IndexedDB. An LRU eviction strategy keeps total cache size within
 * the configured limit.
 *
 * @param config - Optional configuration overrides
 * @returns A fully initialised ModelLoader
 *
 * @example
 * ```typescript
 * import { createModelLoader } from '@localmode/core';
 *
 * const loader = createModelLoader({ maxCacheSize: '1GB' });
 *
 * if (!(await loader.isModelCached('my-model'))) {
 *   await loader.prefetchOne('https://example.com/model.onnx');
 * }
 *
 * const blob = await loader.getBlob('my-model');
 * ```
 */
export function createModelLoader(config: ModelLoaderConfig = {}): ModelLoader {
  // Resolve configuration with defaults
  const cacheName = config.cacheName ?? DEFAULT_CACHE_NAME;
  const maxCacheSize = config.maxCacheSize != null ? parseSize(config.maxCacheSize) : DEFAULT_MAX_CACHE_SIZE;
  const chunkSize = config.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryDelayMs = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const onProgress = config.onProgress;

  // Create internals
  const store = new ChunkedModelStore(cacheName);
  const downloadManager = new DownloadManager(store, { chunkSize, maxRetries, retryDelayMs });
  const lruTracker = new LRUTracker();
  const lockManager = new LockManager(cacheName);

  // Track whether the store is open
  let storeReady: Promise<boolean> | null = null;

  /**
   * Ensure the IndexedDB store is open. Lazy — only opens on first call.
   */
  const ensureOpen = (): Promise<boolean> => {
    if (!storeReady) {
      storeReady = store.open();
    }
    return storeReady;
  };

  /**
   * Derive a modelId from a URL if none is provided.
   */
  const modelIdFromUrl = (url: string): string => {
    try {
      const pathname = new URL(url).pathname;
      // Use the last two path segments as the model ID (e.g. "user/model.onnx")
      const parts = pathname.split('/').filter(Boolean);
      return parts.length >= 2
        ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
        : parts[parts.length - 1] ?? url;
    } catch {
      return url;
    }
  };

  /**
   * Get the total cache size from all metadata.
   */
  const computeTotalCacheSize = async (): Promise<number> => {
    const allMeta = await store.getAllMetadata();
    return allMeta.reduce((sum, m) => sum + m.totalBytes, 0);
  };

  /**
   * Run LRU eviction if needed to make room for a model of the given size.
   */
  const evictIfNeeded = async (newModelBytes: number): Promise<void> => {
    const currentTotal = await computeTotalCacheSize();
    const check = lruTracker.shouldEvict(currentTotal, newModelBytes, maxCacheSize);

    if (!check.shouldEvict) return;

    const allMeta = await store.getAllMetadata();
    const activeIds = downloadManager.getActiveModelIds();
    const candidates = lruTracker.getEvictionCandidates(check.bytesNeeded, allMeta, activeIds);

    if (candidates.length > 0) {
      await lruTracker.performEviction(candidates, store);
    }
  };

  /**
   * Download a single model, using a cross-tab lock for coordination.
   */
  const downloadWithLock = async (
    url: string,
    modelId: string,
    abortSignal?: AbortSignal,
  ): Promise<void> => {
    await lockManager.withLock(
      `download:${modelId}`,
      async () => {
        // Double-check: another tab may have completed the download
        const existing = await store.readMetadata(modelId);
        if (existing?.status === 'complete') return;

        await downloadManager.download(url, modelId, {
          abortSignal,
          onProgress,
        });
      },
      { mode: 'exclusive' },
    );
  };

  // --------------------------------------------------------------------------
  // ModelLoader Implementation
  // --------------------------------------------------------------------------

  const loader: ModelLoader = {
    async prefetch(requests: ModelDownloadRequest[]): Promise<void> {
      await ensureOpen();

      for (const req of requests) {
        // Check if already cached
        const meta = await store.readMetadata(req.modelId);
        if (meta?.status === 'complete') continue;

        // Evict if necessary (estimate size from HEAD — we may not know yet)
        // We'll evict conservatively; the download itself will handle actual size
        await evictIfNeeded(0);

        await downloadWithLock(req.url, req.modelId);
      }
    },

    async prefetchOne(url: string, options?: PrefetchOptions): Promise<void> {
      await ensureOpen();

      const modelId = modelIdFromUrl(url);

      const meta = await store.readMetadata(modelId);
      if (meta?.status === 'complete') return;

      await evictIfNeeded(0);
      await downloadWithLock(url, modelId, options?.abortSignal);
    },

    cancel(modelId: string): void {
      downloadManager.cancel(modelId);
    },

    cancelAll(): void {
      downloadManager.cancelAll();
    },

    async evict(modelId: string): Promise<void> {
      await ensureOpen();
      await store.deleteModel(modelId);
    },

    async getBlob(modelId: string): Promise<Blob | null> {
      await ensureOpen();
      return store.getBlob(modelId);
    },

    async getCacheStatus(): Promise<Map<string, CacheEntry>> {
      await ensureOpen();

      const allMeta = await store.getAllMetadata();
      const result = new Map<string, CacheEntry>();

      for (const meta of allMeta) {
        const isDownloading = downloadManager.isDownloading(meta.modelId);

        result.set(meta.modelId, {
          modelId: meta.modelId,
          status: isDownloading
            ? 'downloading'
            : meta.status === 'complete'
              ? 'cached'
              : meta.status === 'partial'
                ? 'partial'
                : 'error',
          sizeBytes: meta.totalBytes,
          lastAccessed: meta.lastAccessed,
          chunkCount: meta.chunkCount,
          url: meta.url,
        });
      }

      return result;
    },

    async getCacheEntry(modelId: string): Promise<CacheEntry | null> {
      await ensureOpen();

      const meta = await store.readMetadata(modelId);
      if (!meta) return null;

      const isDownloading = downloadManager.isDownloading(modelId);

      return {
        modelId: meta.modelId,
        status: isDownloading
          ? 'downloading'
          : meta.status === 'complete'
            ? 'cached'
            : meta.status === 'partial'
              ? 'partial'
              : 'error',
        sizeBytes: meta.totalBytes,
        lastAccessed: meta.lastAccessed,
        chunkCount: meta.chunkCount,
        url: meta.url,
      };
    },

    async isModelCached(modelId: string): Promise<boolean> {
      await ensureOpen();

      const meta = await store.readMetadata(modelId);
      return meta?.status === 'complete';
    },

    async getTotalCacheSize(): Promise<number> {
      await ensureOpen();
      return computeTotalCacheSize();
    },

    async destroy(): Promise<void> {
      downloadManager.cancelAll();
      store.close();
      storeReady = null;
    },
  };

  return loader;
}
