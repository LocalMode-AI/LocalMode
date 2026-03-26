/**
 * Inference queue types for priority-based task scheduling.
 *
 * @packageDocumentation
 */

/**
 * Priority level for queued operations.
 * Lower index = higher priority (executed first).
 */
export type QueuePriority = string;

/**
 * Statistics for the inference queue.
 */
export interface QueueStats {
  /** Number of tasks waiting to execute */
  pending: number;

  /** Number of tasks currently executing */
  active: number;

  /** Total tasks completed successfully */
  completed: number;

  /** Total tasks that failed */
  failed: number;

  /** Average latency in milliseconds for completed tasks */
  avgLatencyMs: number;
}

/**
 * Configuration for creating an inference queue.
 */
export interface InferenceQueueConfig {
  /** Maximum concurrent operations (default: 1) */
  concurrency?: number;

  /** Priority levels ordered from highest to lowest (default: ['interactive', 'background', 'prefetch']) */
  priorities?: string[];
}

/**
 * Options for adding a task to the queue.
 */
export interface QueueAddOptions {
  /** Priority level for this task (default: first priority level) */
  priority?: string;

  /** AbortSignal to cancel this task before it starts */
  abortSignal?: AbortSignal;
}

/**
 * Event types emitted by the inference queue.
 */
export type QueueEventType = 'stats';

/**
 * Event callback for queue events.
 */
export type QueueEventCallback = (stats: QueueStats) => void;

/**
 * The inference queue interface.
 */
export interface InferenceQueue {
  /** Add a task to the queue and return its result */
  add<T>(fn: () => Promise<T>, options?: QueueAddOptions): Promise<T>;

  /** Subscribe to queue events */
  on(event: QueueEventType, callback: QueueEventCallback): () => void;

  /** Remove all pending (not yet executing) tasks */
  clear(): void;

  /** Clear pending tasks and reject them, clean up */
  destroy(): void;

  /** Current queue statistics */
  readonly stats: QueueStats;
}
