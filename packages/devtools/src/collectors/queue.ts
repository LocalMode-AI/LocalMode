/**
 * Queue collector — tracks InferenceQueue stats.
 *
 * @packageDocumentation
 */

import type { InferenceQueue } from '@localmode/core';
import type { DevToolsBridge, CleanupFn } from '../types.js';

/** Map of registered queue unsubscribe functions. */
const queueCleanups = new Map<string, () => void>();

/**
 * Register an inference queue for DevTools monitoring.
 *
 * @param name - Display name for the queue
 * @param queue - The InferenceQueue instance
 * @param bridge - The DevTools bridge object
 * @param notify - Function to notify subscribers
 * @returns Unsubscribe function
 */
export function registerQueueCollector(
  name: string,
  queue: InferenceQueue,
  bridge: DevToolsBridge,
  notify: () => void
): CleanupFn {
  // Set initial stats
  bridge.queues[name] = queue.stats;

  const unsub = queue.on('stats', (stats) => {
    bridge.queues[name] = stats;
    notify();
  });

  const cleanup = () => {
    unsub();
    queueCleanups.delete(name);
  };

  queueCleanups.set(name, cleanup);
  return cleanup;
}

/**
 * Unsubscribe all registered queues.
 */
export function cleanupAllQueues(): void {
  for (const cleanup of queueCleanups.values()) {
    cleanup();
  }
  queueCleanups.clear();
}
