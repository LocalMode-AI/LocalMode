/**
 * Event stream hook with optional filtering.
 *
 * @packageDocumentation
 */

import { useCallback } from 'react';
import type { DevToolsBridge, DevToolsEvent } from '../types.js';
import { useDevToolsSlice } from './use-devtools-slice.js';

/** Options for {@link useDevToolsEvents}. */
export interface UseDevToolsEventsOptions {
  /**
   * Keep only events whose namespaced `type` matches one of the given
   * types/prefixes. A full type (`'vectordb:add'`) matches exactly; a
   * namespace prefix (`'vectordb'` or `'vectordb:'`) matches every event in
   * that namespace. Omit to keep all events.
   */
  types?: string[];

  /** Keep only the newest N events (applied after `types` filtering). Omit to keep all. */
  limit?: number;
}

/** Frozen inert empty event list for SSR / no-bridge renders. */
const INERT_EVENTS = Object.freeze([]) as readonly DevToolsEvent[] as DevToolsEvent[];

/** Separator for encoding a `types` array into a stable cache key (NUL never appears in event types). */
const TYPES_KEY_SEPARATOR = '\u0000';

/**
 * Check whether an event type matches a filter entry (exact type or
 * namespace prefix, per design D2).
 */
function matchesEventType(eventType: string, filter: string): boolean {
  if (eventType === filter) return true;
  const prefix = filter.endsWith(':') ? filter : `${filter}:`;
  return eventType.startsWith(prefix);
}

/**
 * Copy the event buffer with filters applied. The returned array is always a
 * new container; event entries themselves are never mutated after creation,
 * so they are shared without cloning (design D3). The bridge's buffer is
 * never modified.
 */
function selectEvents(
  bridge: DevToolsBridge,
  types: string[] | undefined,
  limit: number | undefined
): DevToolsEvent[] {
  const events = bridge.events;
  const filtered = types
    ? events.filter((event) => types.some((type) => matchesEventType(event.type, type)))
    : [...events];
  if (limit !== undefined && limit >= 0 && filtered.length > limit) {
    return filtered.slice(filtered.length - limit);
  }
  return filtered;
}

/**
 * Subscribe to the devtools event log (the bridge's circular buffer of
 * `globalEventBus` vectordb/embedding emissions), with optional filtering.
 *
 * Returns a fresh array per bridge notification, ordered as in the bridge's
 * buffer (oldest first). Filtering happens on the returned snapshot only —
 * the underlying buffer is untouched. Event entries are never mutated after
 * creation, so the snapshot shares them without cloning.
 *
 * SSR-safe (empty array on the server), inert (frozen empty array) when
 * devtools was never enabled, and attaches to a bridge created after mount.
 *
 * @param options - Optional `types` (namespaced type/prefix filter) and
 *   `limit` (newest N events) filters
 * @returns The filtered event log snapshot
 *
 * @example
 * ```tsx
 * import { useDevToolsEvents } from '@localmode/devtools/react';
 *
 * function VectorDBEventLog() {
 *   const events = useDevToolsEvents({ types: ['vectordb'], limit: 50 });
 *   return (
 *     <ol>
 *       {events.map((e) => (
 *         <li key={e.id}>{e.timestamp} — {e.type}</li>
 *       ))}
 *     </ol>
 *   );
 * }
 * ```
 *
 * @see useDevToolsModelCache and useDevToolsVectorDBs for aggregates derived
 *   from the same event stream
 */
export function useDevToolsEvents(options?: UseDevToolsEventsOptions): DevToolsEvent[] {
  // Normalize options into primitive cache keys so inline option objects
  // (`useDevToolsEvents({ types: ['vectordb'] })`) keep the selector stable.
  const typesKey = options?.types ? options.types.join(TYPES_KEY_SEPARATOR) : null;
  const limit = options?.limit;

  const select = useCallback(
    (bridge: DevToolsBridge) => {
      const types =
        typesKey === null
          ? undefined
          : typesKey === ''
            ? []
            : typesKey.split(TYPES_KEY_SEPARATOR);
      return selectEvents(bridge, types, limit);
    },
    [typesKey, limit]
  );

  return useDevToolsSlice(select, INERT_EVENTS);
}
