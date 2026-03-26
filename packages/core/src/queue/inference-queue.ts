/**
 * Priority-based inference queue for scheduling AI operations.
 *
 * @packageDocumentation
 */

import type {
  InferenceQueue,
  InferenceQueueConfig,
  QueueAddOptions,
  QueueStats,
  QueueEventType,
  QueueEventCallback,
} from './types.js';

/** Internal task representation */
interface QueuedTask {
  fn: () => Promise<unknown>;
  priority: string;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  abortSignal?: AbortSignal;
  enqueuedAt: number;
}

/**
 * Create a priority-based inference queue.
 *
 * Tasks are executed in priority order (higher priority first).
 * Within the same priority level, tasks execute in FIFO order.
 *
 * @param config - Queue configuration
 * @returns An InferenceQueue instance
 *
 * @example
 * ```ts
 * import { createInferenceQueue } from '@localmode/core';
 *
 * const queue = createInferenceQueue({ concurrency: 1 });
 *
 * // Interactive requests run first
 * const result = await queue.add(
 *   () => embed({ model, value: 'search query' }),
 *   { priority: 'interactive' }
 * );
 *
 * // Background indexing yields to interactive
 * queue.add(
 *   () => embedMany({ model, values: documents }),
 *   { priority: 'background' }
 * );
 * ```
 */
export function createInferenceQueue(config: InferenceQueueConfig = {}): InferenceQueue {
  const {
    concurrency = 1,
    priorities = ['interactive', 'background', 'prefetch'],
  } = config;

  // Priority order map: lower index = higher priority
  const priorityOrder = new Map<string, number>();
  priorities.forEach((p, i) => priorityOrder.set(p, i));

  // Task queues per priority level
  const queues = new Map<string, QueuedTask[]>();
  for (const p of priorities) {
    queues.set(p, []);
  }

  // Stats tracking
  let activeCount = 0;
  let completedCount = 0;
  let failedCount = 0;
  let totalLatencyMs = 0;
  let destroyed = false;

  // Event listeners
  const listeners = new Map<QueueEventType, Set<QueueEventCallback>>();

  function getStats(): QueueStats {
    let pending = 0;
    for (const q of queues.values()) {
      pending += q.length;
    }
    return {
      pending,
      active: activeCount,
      completed: completedCount,
      failed: failedCount,
      avgLatencyMs: completedCount > 0 ? Math.round(totalLatencyMs / completedCount) : 0,
    };
  }

  function emitStats(): void {
    const callbacks = listeners.get('stats');
    if (!callbacks || callbacks.size === 0) return;
    const stats = getStats();
    for (const cb of callbacks) {
      try { cb(stats); } catch { /* ignore listener errors */ }
    }
  }

  function getNextTask(): QueuedTask | null {
    // Find highest-priority non-empty queue
    for (const p of priorities) {
      const q = queues.get(p)!;
      while (q.length > 0) {
        const task = q.shift()!;
        // Skip aborted tasks
        if (task.abortSignal?.aborted) {
          task.reject(new DOMException('Aborted', 'AbortError'));
          continue;
        }
        return task;
      }
    }
    return null;
  }

  function processNext(): void {
    if (destroyed || activeCount >= concurrency) return;

    const task = getNextTask();
    if (!task) return;

    activeCount++;

    // Check abort before executing
    if (task.abortSignal?.aborted) {
      activeCount--;
      task.reject(new DOMException('Aborted', 'AbortError'));
      emitStats();
      processNext();
      return;
    }

    const startTime = Date.now();

    task.fn()
      .then((result) => {
        activeCount--;
        completedCount++;
        totalLatencyMs += Date.now() - startTime;
        task.resolve(result);
        emitStats();
        processNext();
      })
      .catch((error) => {
        activeCount--;
        failedCount++;
        totalLatencyMs += Date.now() - startTime;
        task.reject(error);
        emitStats();
        processNext();
      });
  }

  const queue: InferenceQueue = {
    add<T>(fn: () => Promise<T>, options?: QueueAddOptions): Promise<T> {
      if (destroyed) {
        return Promise.reject(new Error('Queue has been destroyed'));
      }

      const priority = options?.priority ?? priorities[0];
      const abortSignal = options?.abortSignal;

      // Validate priority
      if (!queues.has(priority)) {
        return Promise.reject(
          new Error(`Unknown priority "${priority}". Valid: ${priorities.join(', ')}`)
        );
      }

      return new Promise<T>((resolve, reject) => {
        const task: QueuedTask = {
          fn: fn as () => Promise<unknown>,
          priority,
          resolve: resolve as (value: unknown) => void,
          reject,
          abortSignal,
          enqueuedAt: Date.now(),
        };

        // Listen for abort while queued
        if (abortSignal) {
          const onAbort = () => {
            // Remove from queue if still pending
            const q = queues.get(priority);
            if (q) {
              const idx = q.indexOf(task);
              if (idx !== -1) {
                q.splice(idx, 1);
                reject(new DOMException('Aborted', 'AbortError'));
              }
            }
          };
          if (abortSignal.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          abortSignal.addEventListener('abort', onAbort, { once: true });
        }

        queues.get(priority)!.push(task);
        processNext();
      });
    },

    on(event: QueueEventType, callback: QueueEventCallback): () => void {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(callback);
      return () => {
        listeners.get(event)?.delete(callback);
      };
    },

    clear(): void {
      for (const q of queues.values()) {
        q.length = 0;
      }
    },

    destroy(): void {
      destroyed = true;
      const error = new Error('Queue destroyed');
      for (const q of queues.values()) {
        for (const task of q) {
          task.reject(error);
        }
        q.length = 0;
      }
      listeners.clear();
    },

    get stats(): QueueStats {
      return getStats();
    },
  };

  return queue;
}
