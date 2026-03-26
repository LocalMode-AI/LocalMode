/**
 * Bridge creation and circular buffer for DevTools communication.
 *
 * @packageDocumentation
 */

import type { DevToolsBridge, DevToolsEvent } from './types.js';

/**
 * Create a circular buffer for events.
 *
 * @param maxSize - Maximum number of events to keep
 * @returns Object with push and getAll methods
 */
export function createCircularBuffer(maxSize: number) {
  const buffer: DevToolsEvent[] = [];

  return {
    push(event: DevToolsEvent) {
      if (buffer.length >= maxSize) {
        buffer.shift();
      }
      buffer.push(event);
    },

    getAll(): DevToolsEvent[] {
      return buffer;
    },

    clear() {
      buffer.length = 0;
    },

    get size() {
      return buffer.length;
    },
  };
}

/**
 * Create the DevTools bridge object and attach it to the window.
 *
 * @param eventBufferSize - Maximum events in circular buffer
 * @returns The bridge object and a notify function to alert subscribers
 */
export function createBridge(eventBufferSize: number): {
  bridge: DevToolsBridge;
  notify: () => void;
  eventBuffer: ReturnType<typeof createCircularBuffer>;
} {
  const subscribers = new Set<() => void>();
  const eventBuffer = createCircularBuffer(eventBufferSize);

  const bridge: DevToolsBridge = {
    version: 1,
    enabled: true,
    events: eventBuffer.getAll(),
    queues: {},
    pipelines: {},
    storage: null,
    capabilities: null,
    models: {},
    vectorDBs: {},
    subscribe(callback: () => void) {
      subscribers.add(callback);
      return () => {
        subscribers.delete(callback);
      };
    },
  };

  const notify = () => {
    // Keep events reference in sync with the buffer
    bridge.events = eventBuffer.getAll();
    for (const cb of subscribers) {
      try {
        cb();
      } catch {
        /* ignore subscriber errors */
      }
    }
  };

  if (typeof window !== 'undefined') {
    window.__LOCALMODE_DEVTOOLS__ = bridge;
  }

  return { bridge, notify, eventBuffer };
}

/** Counter for monotonically increasing event IDs. */
let nextEventId = 1;

/**
 * Create a DevToolsEvent.
 *
 * @param type - Event type (e.g., 'vectordb:add')
 * @param data - Event payload
 * @returns A DevToolsEvent object
 */
export function createEvent(type: string, data: Record<string, unknown>): DevToolsEvent {
  return {
    id: nextEventId++,
    type,
    data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Reset the event ID counter (for testing).
 */
export function resetEventIdCounter() {
  nextEventId = 1;
}
