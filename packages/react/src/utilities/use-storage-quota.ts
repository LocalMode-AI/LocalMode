/**
 * @file use-storage-quota.ts
 * @description Hook for monitoring storage quota
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { StorageQuota } from '@localmode/core';

const IS_SERVER = typeof window === 'undefined';

/**
 * Hook for monitoring browser storage quota.
 * Queries on mount and exposes a refresh() function.
 *
 * @returns The full core `StorageQuota` (`usedBytes`, `quotaBytes`,
 * `percentUsed`, `isPersisted`, `availableBytes`) or null while unavailable,
 * plus loading state, query error, and `refresh()`
 *
 * @example
 * ```tsx
 * import { useStorageQuota } from '@localmode/react';
 *
 * function QuotaBar() {
 *   const { quota, refresh } = useStorageQuota();
 *   if (!quota) return null;
 *   return (
 *     <span onClick={refresh}>
 *       {quota.percentUsed.toFixed(1)}% used{quota.isPersisted ? ' (persisted)' : ''}
 *     </span>
 *   );
 * }
 * ```
 */
export function useStorageQuota() {
  const [quota, setQuota] = useState<StorageQuota | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchQuota = useCallback(async () => {
    if (IS_SERVER) return;

    setIsLoading(true);
    setError(null);
    try {
      const { getStorageQuota } = await import('@localmode/core');
      const result = await getStorageQuota();
      if (mountedRef.current && result) {
        // Pass through the full core StorageQuota, including isPersisted
        // and availableBytes.
        setQuota(result);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchQuota();
  }, [fetchQuota]);

  if (IS_SERVER) {
    return { quota: null, isLoading: false, error: null, refresh: async () => {} };
  }

  return { quota, isLoading, error, refresh: fetchQuota };
}
