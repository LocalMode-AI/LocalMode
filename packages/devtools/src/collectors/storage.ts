/**
 * Storage collector — polls storage quota at configurable intervals.
 *
 * @packageDocumentation
 */

import { getStorageQuota } from '@localmode/core';
import type { DevToolsBridge, CleanupFn } from '../types.js';

/**
 * Start polling storage quota.
 *
 * @param bridge - The DevTools bridge object
 * @param notify - Function to notify subscribers
 * @param intervalMs - Polling interval in milliseconds
 * @returns Cleanup function to stop polling
 */
export function startStorageCollector(
  bridge: DevToolsBridge,
  notify: () => void,
  intervalMs: number
): CleanupFn {
  const poll = async () => {
    try {
      const quota = await getStorageQuota();
      if (quota) {
        bridge.storage = {
          usedBytes: quota.usedBytes ?? 0,
          quotaBytes: quota.quotaBytes ?? 0,
          percentUsed: quota.percentUsed ?? 0,
          isPersisted: quota.isPersisted ?? false,
          availableBytes: quota.availableBytes ?? 0,
        };
      } else {
        bridge.storage = null;
      }
      notify();
    } catch {
      bridge.storage = null;
    }
  };

  // Poll immediately, then at interval
  poll();
  const timer = setInterval(poll, intervalMs);

  return () => {
    clearInterval(timer);
  };
}
