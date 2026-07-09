/**
 * Model cache info hook.
 *
 * @packageDocumentation
 */

import type { DevToolsBridge, ModelCacheInfo } from '../types.js';
import { cloneRecord, INERT_EMPTY_RECORD, useDevToolsSlice } from './use-devtools-slice.js';

/** Clone the models record (new container + cloned entries). */
const selectModels = (bridge: DevToolsBridge): Record<string, ModelCacheInfo> =>
  cloneRecord(bridge.models);

/**
 * Subscribe to the model cache info collected from `globalEventBus`
 * `modelLoad` / `modelLoadError` / `embedComplete` emissions.
 *
 * Returns a fresh immutable snapshot per bridge notification — a new record
 * with shallow-cloned `ModelCacheInfo` entries keyed by model ID. Entries are
 * cloned because the collector mutates them in place (e.g. `lastUsed` on
 * every `embedComplete`); a snapshot held by the consumer never changes when
 * the bridge updates.
 *
 * SSR-safe (empty record on the server), inert (frozen empty record) when
 * devtools was never enabled, and attaches to a bridge created after mount.
 *
 * @returns Latest `ModelCacheInfo` per model ID
 *
 * @example
 * ```tsx
 * import { useDevToolsModelCache } from '@localmode/devtools/react';
 *
 * function ModelCacheTable() {
 *   const models = useDevToolsModelCache();
 *   return (
 *     <ul>
 *       {Object.values(models).map((m) => (
 *         <li key={m.modelId}>
 *           {m.modelId}: {m.status} ({m.loadDurationMs}ms)
 *         </li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 *
 * @see useDevToolsEvents for the raw event stream feeding this slice
 */
export function useDevToolsModelCache(): Record<string, ModelCacheInfo> {
  return useDevToolsSlice(selectModels, INERT_EMPTY_RECORD);
}
