/**
 * @file use-model-loader.ts
 * @description React hook for model downloading with progress tracking and cache management
 */

import { useState, useRef, useEffect } from 'react';
import type {
  ModelLoader,
  ModelLoaderConfig,
  CacheEntry,
  ModelDownloadProgress,
  ModelDownloadRequest,
  PrefetchOptions,
} from '@localmode/core';

const IS_SERVER = typeof window === 'undefined';

/** Return type for useModelLoader hook. */
export interface UseModelLoaderReturn {
  /** Map of model download states */
  downloads: Map<string, ModelDownloadProgress>;

  /** Whether any download is active */
  isDownloading: boolean;

  /** Overall progress (0-1) across all active downloads */
  totalProgress: number;

  /** Cache status for all known models */
  cacheStatus: Map<string, CacheEntry>;

  /** Start downloading one or more model files */
  prefetch: (requests: ModelDownloadRequest[]) => Promise<void>;

  /** Start downloading a single model file */
  prefetchOne: (url: string, options?: PrefetchOptions) => Promise<void>;

  /** Cancel a specific download */
  cancel: (modelId: string) => void;

  /** Cancel all active downloads */
  cancelAll: () => void;

  /** Evict a cached model */
  evict: (modelId: string) => Promise<void>;

  /** Check if a model is fully cached */
  isModelCached: (modelId: string) => Promise<boolean>;

  /** Get cache entry for a specific model */
  getCacheEntry: (modelId: string) => Promise<CacheEntry | null>;

  /** Refresh cache status from storage */
  refresh: () => Promise<void>;
}

/**
 * Hook for managing model downloads with progress tracking and cache management.
 *
 * @param config - Optional ModelLoaderConfig
 * @returns Model loader state and actions
 *
 * @example
 * ```tsx
 * import { useModelLoader } from '@localmode/react';
 *
 * function ModelManager() {
 *   const { downloads, isDownloading, prefetch, cacheStatus } = useModelLoader({
 *     maxCacheSize: '2GB',
 *   });
 *
 *   return (
 *     <button onClick={() => prefetch([{ url: modelUrl, modelId: 'my-model' }])}>
 *       Download
 *     </button>
 *   );
 * }
 * ```
 */
export function useModelLoader(config?: ModelLoaderConfig): UseModelLoaderReturn {
  const [downloads, setDownloads] = useState<Map<string, ModelDownloadProgress>>(new Map());
  const [cacheStatus, setCacheStatus] = useState<Map<string, CacheEntry>>(new Map());

  const loaderRef = useRef<ModelLoader | null>(null);
  const mountedRef = useRef(true);
  const rafRef = useRef<number | null>(null);
  const pendingUpdatesRef = useRef<Map<string, ModelDownloadProgress>>(new Map());

  // Derive state
  const isDownloading = downloads.size > 0 && Array.from(downloads.values()).some(
    (d) => d.progress < 1
  );

  const totalProgress = downloads.size > 0
    ? Array.from(downloads.values()).reduce((sum, d) => sum + d.progress, 0) / downloads.size
    : 0;

  // Batch progress updates with RAF
  const flushUpdates = () => {
    if (!mountedRef.current) return;
    if (pendingUpdatesRef.current.size > 0) {
      const newMap = new Map(downloads);
      for (const [id, progress] of pendingUpdatesRef.current) {
        newMap.set(id, progress);
      }
      pendingUpdatesRef.current.clear();
      setDownloads(newMap);
    }
    rafRef.current = null;
  };

  const scheduleUpdate = (modelId: string, progress: ModelDownloadProgress) => {
    pendingUpdatesRef.current.set(modelId, progress);
    if (rafRef.current === null && typeof requestAnimationFrame !== 'undefined') {
      rafRef.current = requestAnimationFrame(flushUpdates);
    }
  };

  // Initialize loader on first client render
  useEffect(() => {
    if (IS_SERVER) return;

    let loader: ModelLoader | null = null;

    const init = async () => {
      try {
        const { createModelLoader } = await import('@localmode/core');
        loader = await createModelLoader({
          ...config,
          onProgress: (modelId, progress) => {
            scheduleUpdate(modelId, progress);
            config?.onProgress?.(modelId, progress);
          },
        });
        loaderRef.current = loader;
      } catch {
        // createModelLoader may not exist yet during development
      }
    };

    init();

    return () => {
      mountedRef.current = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      loader?.destroy();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const prefetch = async (requests: ModelDownloadRequest[]) => {
    if (!loaderRef.current) return;
    await loaderRef.current.prefetch(requests);
    if (mountedRef.current) {
      const status = await loaderRef.current.getCacheStatus();
      setCacheStatus(status);
    }
  };

  const prefetchOne = async (url: string, options?: PrefetchOptions) => {
    if (!loaderRef.current) return;
    await loaderRef.current.prefetchOne(url, options);
    if (mountedRef.current) {
      const status = await loaderRef.current.getCacheStatus();
      setCacheStatus(status);
    }
  };

  const cancel = (modelId: string) => {
    loaderRef.current?.cancel(modelId);
  };

  const cancelAll = () => {
    loaderRef.current?.cancelAll();
  };

  const evict = async (modelId: string) => {
    if (!loaderRef.current) return;
    await loaderRef.current.evict(modelId);
    if (mountedRef.current) {
      const status = await loaderRef.current.getCacheStatus();
      setCacheStatus(status);
    }
  };

  const isModelCached = async (modelId: string): Promise<boolean> => {
    if (!loaderRef.current) return false;
    return loaderRef.current.isModelCached(modelId);
  };

  const getCacheEntry = async (modelId: string): Promise<CacheEntry | null> => {
    if (!loaderRef.current) return null;
    return loaderRef.current.getCacheEntry(modelId);
  };

  const refresh = async () => {
    if (!loaderRef.current) return;
    const status = await loaderRef.current.getCacheStatus();
    if (mountedRef.current) {
      setCacheStatus(status);
    }
  };

  if (IS_SERVER) {
    return {
      downloads: new Map(),
      isDownloading: false,
      totalProgress: 0,
      cacheStatus: new Map(),
      prefetch: async () => {},
      prefetchOne: async () => {},
      cancel: () => {},
      cancelAll: () => {},
      evict: async () => {},
      isModelCached: async () => false,
      getCacheEntry: async () => null,
      refresh: async () => {},
    };
  }

  return {
    downloads,
    isDownloading,
    totalProgress,
    cacheStatus,
    prefetch,
    prefetchOne,
    cancel,
    cancelAll,
    evict,
    isModelCached,
    getCacheEntry,
    refresh,
  };
}
