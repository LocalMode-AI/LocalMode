/**
 * Pipeline run snapshots hook.
 *
 * @packageDocumentation
 */

import type { DevToolsBridge, PipelineSnapshot } from '../types.js';
import { cloneRecord, INERT_EMPTY_RECORD, useDevToolsSlice } from './use-devtools-slice.js';

/** Clone the pipelines record (new container + cloned entries). */
const selectPipelines = (bridge: DevToolsBridge): Record<string, PipelineSnapshot> =>
  cloneRecord(bridge.pipelines);

/**
 * Subscribe to the progress of every pipeline instrumented via
 * `createDevToolsProgressCallback()`.
 *
 * Returns a fresh immutable snapshot per bridge notification — a new record
 * with shallow-cloned `PipelineSnapshot` entries keyed by pipeline name.
 * Running pipelines report `status: 'running'` with `currentStep`/`completed`;
 * finished pipelines transition to `status: 'completed'` with `durationMs`.
 *
 * SSR-safe (empty record on the server), inert (frozen empty record) when
 * devtools was never enabled, and attaches to a bridge created after mount.
 *
 * @returns Latest `PipelineSnapshot` per instrumented pipeline name
 *
 * @example
 * ```tsx
 * import { useDevToolsPipelineRuns } from '@localmode/devtools/react';
 *
 * function PipelineInspector() {
 *   const runs = useDevToolsPipelineRuns();
 *   return (
 *     <ul>
 *       {Object.entries(runs).map(([name, run]) => (
 *         <li key={name}>
 *           {name}: {run.status} ({run.completed}/{run.total})
 *         </li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 *
 * @see useDevToolsQueueStats for inference queue stats
 */
export function useDevToolsPipelineRuns(): Record<string, PipelineSnapshot> {
  return useDevToolsSlice(selectPipelines, INERT_EMPTY_RECORD);
}
