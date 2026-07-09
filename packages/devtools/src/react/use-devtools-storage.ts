/**
 * Storage quota snapshot hook.
 *
 * @packageDocumentation
 */

import type { DevToolsBridge, StorageQuotaSnapshot } from '../types.js';
import { useDevToolsSlice } from './use-devtools-slice.js';

/** Clone the storage snapshot (flat object) or pass through `null`. */
const selectStorage = (bridge: DevToolsBridge): StorageQuotaSnapshot | null =>
  bridge.storage ? { ...bridge.storage } : null;

/**
 * Subscribe to the storage quota snapshot polled by the storage collector
 * (every 5s by default; see `enableDevTools({ storagePollingIntervalMs })`).
 *
 * Returns a fresh immutable copy per bridge notification, or `null` while no
 * quota data is available (before the first poll, or when the Storage API is
 * unavailable).
 *
 * SSR-safe (`null` on the server), inert (`null`) when devtools was never
 * enabled, and attaches to a bridge created after mount.
 *
 * @returns The latest `StorageQuotaSnapshot`, or `null`
 *
 * @example
 * ```tsx
 * import { useDevToolsStorage } from '@localmode/devtools/react';
 *
 * function StorageMeter() {
 *   const storage = useDevToolsStorage();
 *   if (!storage) return <p>No quota data</p>;
 *   return <p>{storage.percentUsed.toFixed(1)}% of quota used</p>;
 * }
 * ```
 *
 * @see useDevToolsCapabilities for the device capabilities slice
 */
export function useDevToolsStorage(): StorageQuotaSnapshot | null {
  return useDevToolsSlice(selectStorage, null);
}
