/**
 * @localmode/devtools
 *
 * Chrome DevTools extension for debugging and monitoring LocalMode applications.
 * Provides real-time visibility into model cache, VectorDB operations,
 * inference queue metrics, pipeline execution, and device capabilities.
 *
 * @packageDocumentation
 */

import type { InferenceQueue } from '@localmode/core';
import type { DevToolsBridge, DevToolsOptions, CleanupFn } from './types.js';
import { createBridge } from './bridge.js';
import { startEventCollector } from './collectors/events.js';
import { registerQueueCollector, cleanupAllQueues } from './collectors/queue.js';
import { createPipelineCollector } from './collectors/pipeline.js';
import { startStorageCollector } from './collectors/storage.js';
import { startCapabilitiesCollector } from './collectors/capabilities.js';

// Module-level state
let bridge: DevToolsBridge | null = null;
let notifyFn: (() => void) | null = null;
let eventBufferRef: ReturnType<typeof createBridge>['eventBuffer'] | null = null;
const cleanups: CleanupFn[] = [];
let enabled = false;

/**
 * Enable DevTools instrumentation.
 *
 * Initializes all collectors and creates the `window.__LOCALMODE_DEVTOOLS__` bridge.
 * Calling when already enabled is a no-op.
 *
 * @param options - Optional configuration for buffer sizes and polling intervals
 *
 * @example
 * ```ts
 * import { enableDevTools } from '@localmode/devtools';
 *
 * if (process.env.NODE_ENV === 'development') {
 *   enableDevTools();
 * }
 * ```
 *
 * @see disableDevTools
 * @see isDevToolsEnabled
 */
export function enableDevTools(options?: DevToolsOptions): void {
  if (enabled) return;

  const eventBufferSize = options?.eventBufferSize ?? 500;
  const storagePollingIntervalMs = options?.storagePollingIntervalMs ?? 5000;

  const result = createBridge(eventBufferSize);
  bridge = result.bridge;
  notifyFn = result.notify;
  eventBufferRef = result.eventBuffer;

  // Start all collectors
  cleanups.push(startEventCollector(bridge, eventBufferRef, notifyFn));
  cleanups.push(startStorageCollector(bridge, notifyFn, storagePollingIntervalMs));
  cleanups.push(startCapabilitiesCollector(bridge, notifyFn));

  enabled = true;
}

/**
 * Disable DevTools instrumentation.
 *
 * Unsubscribes all collectors, stops polling, and sets the bridge to disabled.
 * The bridge object is preserved on window for inspection of the last snapshot.
 *
 * @example
 * ```ts
 * import { disableDevTools } from '@localmode/devtools';
 *
 * disableDevTools();
 * ```
 *
 * @see enableDevTools
 */
export function disableDevTools(): void {
  if (!enabled) return;

  for (const cleanup of cleanups) {
    cleanup();
  }
  cleanups.length = 0;

  cleanupAllQueues();

  if (bridge) {
    bridge.enabled = false;
  }

  enabled = false;
  bridge = null;
  notifyFn = null;
  eventBufferRef = null;
}

/**
 * Check if DevTools instrumentation is currently enabled.
 *
 * @returns `true` if `enableDevTools()` has been called and `disableDevTools()` has not
 *
 * @example
 * ```ts
 * import { isDevToolsEnabled } from '@localmode/devtools';
 *
 * if (isDevToolsEnabled()) {
 *   console.log('DevTools is active');
 * }
 * ```
 */
export function isDevToolsEnabled(): boolean {
  return enabled;
}

/**
 * Register an inference queue for DevTools monitoring.
 *
 * Queue stats (pending, active, completed, failed, avgLatencyMs) are tracked
 * in real-time and displayed in the Queue tab of the DevTools panel.
 *
 * @param name - Display name for the queue in DevTools
 * @param queue - The InferenceQueue instance to monitor
 * @returns Unsubscribe function to stop monitoring this queue
 * @throws If DevTools is not enabled
 *
 * @example
 * ```ts
 * import { createInferenceQueue } from '@localmode/core';
 * import { enableDevTools, registerQueue } from '@localmode/devtools';
 *
 * enableDevTools();
 * const queue = createInferenceQueue({ concurrency: 1 });
 * const unsubscribe = registerQueue('embedding', queue);
 * ```
 *
 * @see enableDevTools
 */
export function registerQueue(name: string, queue: InferenceQueue): CleanupFn {
  if (!bridge || !notifyFn) {
    return () => {};
  }
  return registerQueueCollector(name, queue, bridge, notifyFn);
}

/**
 * Create a DevTools-aware progress callback for a pipeline.
 *
 * Returns an `onProgress` callback compatible with `PipelineRunOptions.onProgress`.
 * Pipeline execution is tracked in real-time in the Pipeline tab of the DevTools panel.
 *
 * @param pipelineName - Display name for the pipeline in DevTools
 * @returns An onProgress callback function
 *
 * @example
 * ```ts
 * import { createPipeline } from '@localmode/core';
 * import { enableDevTools, createDevToolsProgressCallback } from '@localmode/devtools';
 *
 * enableDevTools();
 * const onProgress = createDevToolsProgressCallback('rag-ingest');
 *
 * const pipeline = createPipeline('rag-ingest')
 *   .step('chunk', chunkFn)
 *   .step('embed', embedFn)
 *   .build();
 *
 * await pipeline.run(input, { onProgress });
 * ```
 *
 * @see enableDevTools
 */
export function createDevToolsProgressCallback(
  pipelineName: string
): (progress: { completed: number; total: number; currentStep: string }) => void {
  if (!bridge || !notifyFn) {
    return () => {};
  }
  return createPipelineCollector(pipelineName, bridge, notifyFn);
}

// Re-export types
export type {
  DevToolsOptions,
  DevToolsBridge,
  DevToolsEvent,
  ModelCacheInfo,
  VectorDBSnapshot,
  PipelineSnapshot,
  StorageQuotaSnapshot,
  DeviceCapabilitiesSnapshot,
  CleanupFn,
} from './types.js';
