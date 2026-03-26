/**
 * Event collector — subscribes to globalEventBus for VectorDB and Embedding events.
 *
 * @packageDocumentation
 */

import { globalEventBus } from '@localmode/core';
import type { DevToolsBridge, VectorDBSnapshot, CleanupFn } from '../types.js';
import { createEvent } from '../bridge.js';

/** VectorDB event types to subscribe to. */
const VECTORDB_EVENTS = [
  'add', 'addMany', 'get', 'update', 'delete',
  'deleteMany', 'search', 'clear', 'error', 'open', 'close',
] as const;

/** Embedding event types to subscribe to. */
const EMBEDDING_EVENTS = [
  'embedStart', 'embedComplete', 'embedError', 'modelLoad', 'modelLoadError',
] as const;

/**
 * Start the event collector.
 *
 * @param bridge - The DevTools bridge object
 * @param eventBuffer - The circular buffer for events
 * @param notify - Function to notify subscribers of changes
 * @returns Cleanup function to unsubscribe all listeners
 */
export function startEventCollector(
  bridge: DevToolsBridge,
  eventBuffer: ReturnType<import('../bridge.js').createCircularBuffer>,
  notify: () => void
): CleanupFn {
  const unsubscribes: Array<() => void> = [];

  // Subscribe to VectorDB events
  for (const eventType of VECTORDB_EVENTS) {
    const unsub = globalEventBus.on(eventType, (data: unknown) => {
      const event = createEvent(`vectordb:${eventType}`, (data ?? {}) as Record<string, unknown>);
      eventBuffer.push(event);
      updateVectorDBStats(bridge, eventType, (data ?? {}) as Record<string, unknown>);
      notify();
    });
    unsubscribes.push(unsub);
  }

  // Subscribe to Embedding events
  for (const eventType of EMBEDDING_EVENTS) {
    const unsub = globalEventBus.on(eventType, (data: unknown) => {
      const event = createEvent(`embedding:${eventType}`, (data ?? {}) as Record<string, unknown>);
      eventBuffer.push(event);
      updateModelInfo(bridge, eventType, (data ?? {}) as Record<string, unknown>);
      notify();
    });
    unsubscribes.push(unsub);
  }

  return () => {
    for (const unsub of unsubscribes) {
      unsub();
    }
  };
}

/** Update aggregated VectorDB stats from an event. */
function updateVectorDBStats(
  bridge: DevToolsBridge,
  eventType: string,
  data: Record<string, unknown>
) {
  const collection = (data.collection as string) ?? 'default';
  const now = new Date().toISOString();

  if (!bridge.vectorDBs[collection]) {
    bridge.vectorDBs[collection] = {
      totalAdds: 0,
      totalSearches: 0,
      totalDeletes: 0,
      avgSearchDurationMs: 0,
      lastActivity: now,
    };
  }

  const snapshot = bridge.vectorDBs[collection];
  snapshot.lastActivity = now;

  switch (eventType) {
    case 'add':
      snapshot.totalAdds++;
      break;
    case 'addMany': {
      const ids = data.ids as string[] | undefined;
      snapshot.totalAdds += ids?.length ?? 1;
      break;
    }
    case 'delete':
      snapshot.totalDeletes++;
      break;
    case 'deleteMany': {
      const delIds = data.ids as string[] | undefined;
      snapshot.totalDeletes += delIds?.length ?? 1;
      break;
    }
    case 'search': {
      const durationMs = data.durationMs as number | undefined;
      const prevTotal = snapshot.totalSearches;
      snapshot.totalSearches++;
      if (durationMs !== undefined) {
        snapshot.avgSearchDurationMs =
          (snapshot.avgSearchDurationMs * prevTotal + durationMs) / snapshot.totalSearches;
      }
      break;
    }
  }
}

/** Update model info from embedding events. */
function updateModelInfo(
  bridge: DevToolsBridge,
  eventType: string,
  data: Record<string, unknown>
) {
  const now = new Date().toISOString();

  if (eventType === 'modelLoad') {
    const modelId = data.modelId as string;
    bridge.models[modelId] = {
      modelId,
      loadDurationMs: (data.durationMs as number) ?? 0,
      status: 'loaded',
      lastUsed: now,
    };
  } else if (eventType === 'modelLoadError') {
    const modelId = data.modelId as string;
    bridge.models[modelId] = {
      modelId,
      loadDurationMs: 0,
      status: 'error',
      lastUsed: now,
    };
  } else if (eventType === 'embedComplete') {
    // Update lastUsed for the model if we can find it
    for (const model of Object.values(bridge.models)) {
      if (model.status === 'loaded') {
        model.lastUsed = now;
      }
    }
  }
}
