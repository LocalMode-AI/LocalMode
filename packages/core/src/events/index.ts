/**
 * Event System
 *
 * Provides event emission and subscription for VectorDB lifecycle events.
 * Enables reactive updates in UI frameworks.
 *
 * @packageDocumentation
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Callback function for event handlers.
 */
export type EventCallback<T = unknown> = (data: T) => void | Promise<void>;

/**
 * Unsubscribe function returned when subscribing to events.
 */
export type Unsubscribe = () => void;

/**
 * VectorDB event types.
 */
export interface VectorDBEvents extends Record<string, unknown> {
  /** Emitted when a document is added */
  add: { id: string; collection?: string };

  /** Emitted when multiple documents are added */
  addMany: { ids: string[]; collection?: string };

  /** Emitted after a document is retrieved */
  get: { id: string; found: boolean };

  /** Emitted when a document is updated */
  update: { id: string; collection?: string };

  /** Emitted when a document is deleted */
  delete: { id: string };

  /** Emitted when multiple documents are deleted */
  deleteMany: { ids: string[] };

  /** Emitted after a search operation */
  search: { resultsCount: number; k: number; durationMs: number };

  /** Emitted when the database is cleared */
  clear: { documentCount: number };

  /** Emitted on any error */
  error: { operation: string; error: Error };

  /** Emitted when database is opened */
  open: { name: string };

  /** Emitted when database is closed */
  close: { name: string };

  /** Index signature for Record<string, unknown> compatibility */
  [key: string]: unknown;
}

/**
 * Embedding model event types.
 */
export interface EmbeddingEvents {
  /** Emitted before embedding starts */
  embedStart: { valueCount: number };

  /** Emitted after embedding completes */
  embedComplete: { valueCount: number; durationMs: number; tokens: number };

  /** Emitted on embedding error */
  embedError: { error: Error };

  /** Emitted when model is loaded */
  modelLoad: { modelId: string; durationMs: number };

  /** Emitted when model loading fails */
  modelLoadError: { modelId: string; error: Error };
}

// ============================================================================
// Event Emitter Implementation
// ============================================================================

/**
 * Type-safe event emitter.
 *
 * @example
 * ```typescript
 * import { EventEmitter, VectorDBEvents } from '@localmode/core';
 *
 * const emitter = new EventEmitter<VectorDBEvents>();
 *
 * // Subscribe to events
 * const unsubscribe = emitter.on('add', ({ id }) => {
 *   console.log('Document added:', id);
 * });
 *
 * // Emit events
 * emitter.emit('add', { id: 'doc-1' });
 *
 * // Unsubscribe when done
 * unsubscribe();
 * ```
 */
export class EventEmitter<Events extends Record<string, unknown>> {
  private listeners: Map<keyof Events, Set<EventCallback>> = new Map();

  /**
   * Subscribe to an event.
   *
   * @param event - Event name to subscribe to
   * @param callback - Function to call when event is emitted
   * @returns Unsubscribe function
   */
  on<K extends keyof Events>(event: K, callback: EventCallback<Events[K]>): Unsubscribe {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }

    set.add(callback as EventCallback);

    return () => {
      set?.delete(callback as EventCallback);
      if (set?.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  /**
   * Subscribe to an event for a single emission.
   *
   * @param event - Event name to subscribe to
   * @param callback - Function to call when event is emitted
   * @returns Unsubscribe function
   */
  once<K extends keyof Events>(event: K, callback: EventCallback<Events[K]>): Unsubscribe {
    const wrappedCallback: EventCallback<Events[K]> = (data) => {
      unsubscribe();
      callback(data);
    };
    const unsubscribe = this.on(event, wrappedCallback);
    return unsubscribe;
  }

  /**
   * Emit an event.
   *
   * @param event - Event name to emit
   * @param data - Event data
   */
  emit<K extends keyof Events>(event: K, data: Events[K]): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const callback of set) {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event handler for "${String(event)}":`, error);
        }
      }
    }
  }

  /**
   * Emit an event and wait for all async handlers.
   *
   * @param event - Event name to emit
   * @param data - Event data
   */
  async emitAsync<K extends keyof Events>(event: K, data: Events[K]): Promise<void> {
    const set = this.listeners.get(event);
    if (set) {
      const promises: Promise<void>[] = [];
      for (const callback of set) {
        try {
          const result = callback(data);
          if (result instanceof Promise) {
            promises.push(result);
          }
        } catch (error) {
          console.error(`Error in event handler for "${String(event)}":`, error);
        }
      }
      await Promise.all(promises);
    }
  }

  /**
   * Remove all listeners for an event.
   *
   * @param event - Event name to clear (optional, clears all if not specified)
   */
  off<K extends keyof Events>(event?: K): void {
    if (event !== undefined) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get the number of listeners for an event.
   *
   * @param event - Event name
   * @returns Number of listeners
   */
  listenerCount<K extends keyof Events>(event: K): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  /**
   * Check if there are any listeners for an event.
   *
   * @param event - Event name
   * @returns true if there are listeners
   */
  hasListeners<K extends keyof Events>(event: K): boolean {
    return this.listenerCount(event) > 0;
  }

  /**
   * Get all event names with listeners.
   *
   * @returns Array of event names
   */
  eventNames(): Array<keyof Events> {
    return Array.from(this.listeners.keys());
  }
}

/**
 * Create a new event emitter.
 *
 * @returns New EventEmitter instance
 *
 * @example
 * ```typescript
 * import { createEventEmitter, VectorDBEvents } from '@localmode/core';
 *
 * const events = createEventEmitter<VectorDBEvents>();
 *
 * events.on('add', ({ id }) => {
 *   console.log('Added:', id);
 * });
 * ```
 */
export function createEventEmitter<
  Events extends Record<string, unknown> = VectorDBEvents
>(): EventEmitter<Events> {
  return new EventEmitter<Events>();
}

// ============================================================================
// Event Bus (Shared Events Across Instances)
// ============================================================================

/**
 * Global event bus for cross-instance communication.
 *
 * Useful for:
 * - Synchronizing state across multiple VectorDB instances
 * - Notifying UI components of database changes
 * - Debugging and logging
 *
 * @example
 * ```typescript
 * import { globalEventBus } from '@localmode/core';
 *
 * // Subscribe to all database changes
 * globalEventBus.on('add', ({ id }) => {
 *   console.log('Document added somewhere:', id);
 * });
 * ```
 */
export const globalEventBus = createEventEmitter<VectorDBEvents>();

// ============================================================================
// Event Middleware
// ============================================================================

/**
 * Create event-emitting middleware for VectorDB.
 *
 * @param emitter - Event emitter to use
 * @returns VectorDB middleware
 *
 * @example
 * ```typescript
 * import { wrapVectorDB, createEventEmitter, eventMiddleware } from '@localmode/core';
 *
 * const events = createEventEmitter();
 *
 * // Subscribe to events
 * events.on('add', ({ id }) => console.log('Added:', id));
 * events.on('delete', ({ id }) => console.log('Deleted:', id));
 *
 * // Create DB with event middleware
 * const db = wrapVectorDB({
 *   db: baseDb,
 *   middleware: eventMiddleware(events),
 * });
 * ```
 */
export function eventMiddleware(
  emitter: EventEmitter<VectorDBEvents>
): {
  afterAdd: (doc: { id: string; metadata?: { collection?: string } }) => void;
  afterDelete: (id: string) => void;
  afterClear: () => void;
} {
  return {
    afterAdd: (doc) => {
      emitter.emit('add', {
        id: doc.id,
        collection: doc.metadata?.collection,
      });
    },
    afterDelete: (id) => {
      emitter.emit('delete', { id });
    },
    afterClear: () => {
      emitter.emit('clear', { documentCount: 0 });
    },
  };
}

// Types are exported inline at the top of the file

