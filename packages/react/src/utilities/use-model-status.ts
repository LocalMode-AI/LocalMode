/**
 * @file use-model-status.ts
 * @description Hook for tracking model loading and readiness state, backed by
 * the useModelLoad registry
 */

import { useCallback, useSyncExternalStore } from 'react';
import {
  getModelStatusSnapshot,
  getServerModelStatusSnapshot,
  subscribeToModelLoadEntry,
} from './use-model-load.js';

/** Options for the useModelStatus hook */
interface ModelWithId {
  readonly modelId: string;
  readonly provider: string;
}

/**
 * Hook for tracking whether a model is ready for inference.
 *
 * Looks up the shared model-load registry (see `useModelLoad`) by
 * `model.modelId` and reflects the real load lifecycle: `isLoading` while a
 * load is in flight, `isReady` once the warmup inference resolved, `progress`
 * (0-1) from normalized provider progress events, and `error` when the load
 * failed. When no load has been observed for the modelId, it reports
 * `{ isReady: false, isLoading: false, progress: 0, error: null }`.
 *
 * Behavior fix (v2): this hook previously reported `isReady: true`
 * optimistically as soon as a model instance existed, without observing any
 * load — provider models load lazily on first inference, so a constructed
 * instance proves nothing. It now observes the actual lifecycle driven by
 * `useModelLoad({ key: modelId, ... })`.
 *
 * @param model - Any model instance with modelId and provider
 * @returns Model readiness state: `{ isReady, isLoading, progress, error }`
 *
 * @example
 * ```tsx
 * import { useModelStatus } from '@localmode/react';
 *
 * function StatusBadge({ model }) {
 *   const { isReady, isLoading, progress } = useModelStatus(model);
 *   if (isLoading) return <span>Loading {(progress * 100).toFixed(0)}%</span>;
 *   return <span>{isReady ? 'Ready' : 'Not loaded'}</span>;
 * }
 * ```
 *
 * @see useModelLoad for driving the load lifecycle this hook observes
 */
export function useModelStatus(model: ModelWithId) {
  const key = model.modelId;

  const subscribe = useCallback(
    (listener: () => void) => subscribeToModelLoadEntry(key, listener),
    [key]
  );
  const getSnapshot = useCallback(() => getModelStatusSnapshot(key), [key]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerModelStatusSnapshot);
}
