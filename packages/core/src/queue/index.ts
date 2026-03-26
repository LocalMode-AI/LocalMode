/**
 * Inference queue module — priority-based task scheduling.
 *
 * @packageDocumentation
 */

export { createInferenceQueue } from './inference-queue.js';

export type {
  InferenceQueue,
  InferenceQueueConfig,
  QueueAddOptions,
  QueueStats,
  QueuePriority,
  QueueEventType,
  QueueEventCallback,
} from './types.js';
