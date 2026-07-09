/**
 * @file use-semantic-cache.ts
 * @description Hook for managing a SemanticCache lifecycle in React components
 */

import { useState, useEffect, useRef } from 'react';
import type { SemanticCache, SemanticCacheConfig, CacheStats } from '@localmode/core';

/**
 * Options for the useSemanticCache hook.
 *
 * ⚠️ Options are captured ONCE on mount. Changing any option after mount
 * (threshold, maxEntries, ttlMs, embeddingModel, ...) has NO effect — the
 * cache is NOT re-created. Remount the component (e.g. with a React `key`)
 * to apply new options.
 */
export interface UseSemanticCacheOptions extends SemanticCacheConfig {}

/** Return type for the useSemanticCache hook */
export interface UseSemanticCacheReturn {
  /** The cache instance (null until initialized) */
  cache: SemanticCache | null;

  /**
   * Cache statistics snapshot. NOT live — taken at initialization and after
   * `clear()`; call `refreshStats()` after `cache.store()` / `cache.lookup()`
   * to update it.
   */
  stats: CacheStats;

  /** Whether the cache is being initialized */
  isLoading: boolean;

  /** Error during cache initialization */
  error: Error | null;

  /** Refresh stats from the cache */
  refreshStats: () => void;

  /**
   * Clear cached entries (optionally for a single modelId) and automatically
   * refresh `stats`. Resolves to `{ entriesRemoved: 0 }` if the cache is not
   * initialized yet.
   */
  clear: (filter?: { modelId?: string }) => Promise<{ entriesRemoved: number }>;
}

/** Empty stats used before initialization */
const EMPTY_STATS: CacheStats = {
  entries: 0,
  hits: 0,
  misses: 0,
  hitRate: 0,
  oldestEntryMs: null,
  newestEntryMs: null,
};

/**
 * Hook for managing a SemanticCache lifecycle.
 *
 * Creates a `SemanticCache` on mount and destroys it on unmount.
 * Provides the cache instance, a stats snapshot, and a `clear()` helper
 * that auto-refreshes stats.
 *
 * ⚠️ **Options are captured once, on mount.** Changing any option after
 * mount is silently ignored — the cache is NOT re-created and the new values
 * never reach it. To apply different options, remount the component (e.g.
 * by changing its React `key`).
 *
 * Stats are a snapshot, not a live subscription: call `refreshStats()` after
 * `cache.store()` / `cache.lookup()` calls; the hook's own `clear()` refreshes
 * stats automatically.
 *
 * @param options - SemanticCacheConfig passed to createSemanticCache() (read once on mount)
 * @returns Cache instance, stats, loading state, error, refreshStats, and clear
 *
 * @example
 * ```tsx
 * import { useSemanticCache } from '@localmode/react';
 * import { transformers } from '@localmode/transformers';
 *
 * function CachedChat() {
 *   const { cache, stats, isLoading } = useSemanticCache({
 *     embeddingModel: transformers.embedding('Xenova/bge-small-en-v1.5'),
 *   });
 *
 *   if (isLoading || !cache) return <p>Initializing cache...</p>;
 *
 *   return (
 *     <div>
 *       <p>Cache entries: {stats.entries}</p>
 *       <p>Hit rate: {(stats.hitRate * 100).toFixed(1)}%</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useSemanticCache(options: UseSemanticCacheOptions): UseSemanticCacheReturn {
  const [cache, setCache] = useState<SemanticCache | null>(null);
  const [stats, setStats] = useState<CacheStats>(EMPTY_STATS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const cacheRef = useRef<SemanticCache | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    let destroyed = false;

    async function init() {
      try {
        const { createSemanticCache } = await import('@localmode/core');
        const instance = await createSemanticCache(options);

        if (destroyed || !mountedRef.current) {
          await instance.destroy();
          return;
        }

        cacheRef.current = instance;
        setCache(instance);
        setStats(instance.stats());
        setIsLoading(false);
      } catch (err) {
        if (mountedRef.current && !destroyed) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsLoading(false);
        }
      }
    }

    init();

    return () => {
      mountedRef.current = false;
      destroyed = true;

      if (cacheRef.current) {
        cacheRef.current.destroy().catch(() => {
          // Ignore destroy errors on unmount
        });
        cacheRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshStats = () => {
    if (cacheRef.current) {
      try {
        setStats(cacheRef.current.stats());
      } catch {
        // Cache may be destroyed
      }
    }
  };

  const clear = async (filter?: { modelId?: string }) => {
    if (!cacheRef.current) {
      // Cache not initialized (or already destroyed) — nothing to remove
      return { entriesRemoved: 0 };
    }
    const result = await cacheRef.current.clear(filter);
    refreshStats();
    return result;
  };

  return { cache, stats, isLoading, error, refreshStats, clear };
}
