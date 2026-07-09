/**
 * VectorDB stats hook.
 *
 * @packageDocumentation
 */

import type { DevToolsBridge, VectorDBSnapshot } from '../types.js';
import { cloneRecord, INERT_EMPTY_RECORD, useDevToolsSlice } from './use-devtools-slice.js';

/** Clone the vectorDBs record (new container + cloned entries). */
const selectVectorDBs = (bridge: DevToolsBridge): Record<string, VectorDBSnapshot> =>
  cloneRecord(bridge.vectorDBs);

/**
 * Subscribe to the per-collection VectorDB stats aggregated from
 * `globalEventBus` vectordb emissions (`add`, `search`, `delete`, ...).
 *
 * Returns a fresh immutable snapshot per bridge notification — a new record
 * with shallow-cloned `VectorDBSnapshot` entries keyed by collection name.
 * Entries are cloned because the collector mutates them in place (operation
 * counters, `avgSearchDurationMs` running average, `lastActivity`).
 *
 * SSR-safe (empty record on the server), inert (frozen empty record) when
 * devtools was never enabled, and attaches to a bridge created after mount.
 *
 * @returns Latest `VectorDBSnapshot` per collection name
 *
 * @example
 * ```tsx
 * import { useDevToolsVectorDBs } from '@localmode/devtools/react';
 *
 * function VectorDBObservability() {
 *   const collections = useDevToolsVectorDBs();
 *   return (
 *     <ul>
 *       {Object.entries(collections).map(([name, stats]) => (
 *         <li key={name}>
 *           {name}: {stats.totalAdds} adds, {stats.totalSearches} searches
 *         </li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 *
 * @see useDevToolsEvents for the raw event stream feeding this slice
 */
export function useDevToolsVectorDBs(): Record<string, VectorDBSnapshot> {
  return useDevToolsSlice(selectVectorDBs, INERT_EMPTY_RECORD);
}
