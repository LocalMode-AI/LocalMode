/**
 * @localmode/devtools/react
 *
 * React hooks for subscribing to the LocalMode DevTools bridge
 * (`window.__LOCALMODE_DEVTOOLS__`). One hook per bridge data domain, all
 * built on `useSyncExternalStore` with version-keyed immutable snapshots.
 *
 * Guarantees (see each hook's JSDoc):
 * - Subscribe on mount, fully unsubscribe on unmount (no leaks).
 * - SSR-safe: no `window` access during server render; inert values on the server.
 * - Inert, referentially stable values when devtools is absent; after
 *   `disableDevTools()` the last snapshots are preserved and
 *   `useDevToolsStatus()` reports `{ available: true, enabled: false }`.
 * - Late-enable attachment: a hook mounted before `enableDevTools()` attaches
 *   once the bridge appears — no remount needed.
 * - Slice hooks return fresh immutable copies per notification (the bridge
 *   mutates its objects in place; snapshots never alias them).
 *
 * @example
 * ```tsx
 * import { enableDevTools } from '@localmode/devtools';
 * import { useDevToolsQueueStats, useDevToolsEvents } from '@localmode/devtools/react';
 *
 * enableDevTools();
 *
 * function Observability() {
 *   const queues = useDevToolsQueueStats();
 *   const events = useDevToolsEvents({ types: ['vectordb'], limit: 50 });
 *   // render…
 * }
 * ```
 *
 * @packageDocumentation
 */

// Hooks
export { useDevToolsBridge } from './use-devtools-bridge.js';
export { useDevToolsStatus } from './use-devtools-status.js';
export { useDevToolsQueueStats } from './use-devtools-queue-stats.js';
export { useDevToolsEvents } from './use-devtools-events.js';
export { useDevToolsModelCache } from './use-devtools-model-cache.js';
export { useDevToolsPipelineRuns } from './use-devtools-pipeline-runs.js';
export { useDevToolsVectorDBs } from './use-devtools-vector-dbs.js';
export { useDevToolsStorage } from './use-devtools-storage.js';
export { useDevToolsCapabilities } from './use-devtools-capabilities.js';

// Option / return types
export type { DevToolsStatus } from './use-devtools-status.js';
export type { UseDevToolsEventsOptions } from './use-devtools-events.js';
export type {
  DevToolsBridge,
  DevToolsEvent,
  ModelCacheInfo,
  VectorDBSnapshot,
  PipelineSnapshot,
  StorageQuotaSnapshot,
  DeviceCapabilitiesSnapshot,
} from '../types.js';
export type { QueueStats } from '@localmode/core';
