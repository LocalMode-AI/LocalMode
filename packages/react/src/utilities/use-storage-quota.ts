/**
 * @file use-storage-quota.ts
 * @description Hook for monitoring storage quota
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const IS_SERVER = typeof window === 'undefined';

interface StorageQuotaInfo {
  usedBytes: number;
  quotaBytes: number;
  percentUsed: number;
}

/**
 * Hook for monitoring browser storage quota.
 * Queries on mount and exposes a refresh() function.
 *
 * @returns Storage quota information and loading state
 */
export function useStorageQuota() {
  const [quota, setQuota] = useState<StorageQuotaInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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
    try {
      const { getStorageQuota } = await import('@localmode/core');
      const result = await getStorageQuota();
      if (mountedRef.current && result) {
        setQuota({
          usedBytes: result.usedBytes,
          quotaBytes: result.quotaBytes,
          percentUsed: result.percentUsed,
        });
      }
      if (mountedRef.current) setIsLoading(false);
    } catch {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuota();
  }, [fetchQuota]);

  if (IS_SERVER) {
    return { quota: null, isLoading: false, refresh: async () => {} };
  }

  return { quota, isLoading, refresh: fetchQuota };
}
