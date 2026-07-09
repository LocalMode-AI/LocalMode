/**
 * Inference queue stats hook.
 *
 * @packageDocumentation
 */

import type { QueueStats } from '@localmode/core';
import type { DevToolsBridge } from '../types.js';
import { cloneRecord, INERT_EMPTY_RECORD, useDevToolsSlice } from './use-devtools-slice.js';

/** Clone the queues record (new container + cloned entries). */
const selectQueues = (bridge: DevToolsBridge): Record<string, QueueStats> =>
  cloneRecord(bridge.queues);

/**
 * Subscribe to the stats of every inference queue registered via
 * `registerQueue()`.
 *
 * Returns a fresh immutable snapshot per bridge notification — a new record
 * with shallow-cloned `QueueStats` entries, keyed by the name passed to
 * `registerQueue()`. A snapshot held by the consumer never changes when the
 * bridge updates; new data arrives only as a new snapshot on re-render.
 *
 * SSR-safe (empty record on the server), inert (frozen empty record) when
 * devtools was never enabled, and attaches to a bridge created after mount.
 *
 * @returns Latest `QueueStats` per registered queue name
 *
 * @example
 * ```tsx
 * import { useDevToolsQueueStats } from '@localmode/devtools/react';
 *
 * function QueueMonitor() {
 *   const queues = useDevToolsQueueStats();
 *   return (
 *     <ul>
 *       {Object.entries(queues).map(([name, stats]) => (
 *         <li key={name}>
 *           {name}: {stats.pending} pending, {stats.completed} completed
 *         </li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 *
 * @see useDevToolsBridge for the live bridge object
 */
export function useDevToolsQueueStats(): Record<string, QueueStats> {
  return useDevToolsSlice(selectQueues, INERT_EMPTY_RECORD);
}
