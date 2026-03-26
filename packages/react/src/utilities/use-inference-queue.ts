/**
 * @file use-inference-queue.ts
 * @description Hook for creating and managing a priority-based inference queue
 */

import { useState, useRef, useEffect } from 'react';
import type { InferenceQueue, InferenceQueueConfig, QueueStats } from '@localmode/core';

const IS_SERVER = typeof window === 'undefined';

/** Return type for the useInferenceQueue hook */
export interface UseInferenceQueueReturn {
  /** The queue instance (null on server) */
  queue: InferenceQueue | null;
  /** Live queue statistics, updated after each task */
  stats: QueueStats;
}

const EMPTY_STATS: QueueStats = {
  pending: 0,
  active: 0,
  completed: 0,
  failed: 0,
  avgLatencyMs: 0,
};

/**
 * Hook for creating and managing a priority-based inference queue.
 *
 * Creates an InferenceQueue on mount and destroys it on unmount.
 * Provides live stats that update reactively after each task completes.
 *
 * @param config - Queue configuration (concurrency, priorities)
 * @returns Queue instance and live stats
 *
 * @example
 * ```tsx
 * import { useInferenceQueue } from '@localmode/react';
 *
 * function MyComponent() {
 *   const { queue, stats } = useInferenceQueue({ concurrency: 1 });
 *
 *   const handleSearch = async (query: string) => {
 *     if (!queue) return;
 *     const result = await queue.add(
 *       () => embed({ model, value: query }),
 *       { priority: 'interactive' }
 *     );
 *   };
 *
 *   return <div>Pending: {stats.pending}</div>;
 * }
 * ```
 */
export function useInferenceQueue(config?: InferenceQueueConfig): UseInferenceQueueReturn {
  const [stats, setStats] = useState<QueueStats>(EMPTY_STATS);
  const queueRef = useRef<InferenceQueue | null>(null);
  const configRef = useRef(config);

  useEffect(() => {
    if (IS_SERVER) return;

    // Lazy import to avoid bundling queue code on server
    let destroyed = false;

    import('@localmode/core').then(({ createInferenceQueue }) => {
      if (destroyed) return;

      const queue = createInferenceQueue(configRef.current);
      queueRef.current = queue;

      // Subscribe to stats updates
      queue.on('stats', (newStats) => {
        if (!destroyed) {
          setStats({ ...newStats });
        }
      });

      // Force a re-render so consumers see the queue
      setStats(queue.stats);
    });

    return () => {
      destroyed = true;
      queueRef.current?.destroy();
      queueRef.current = null;
    };
  }, []);

  if (IS_SERVER) {
    return { queue: null, stats: EMPTY_STATS };
  }

  return { queue: queueRef.current, stats };
}
