/**
 * Internal `useSyncExternalStore`-based subscription helper shared by all
 * devtools hooks (design D3).
 *
 * - Version-keyed snapshot cache: every bridge notification / lifecycle signal
 *   bumps a per-hook version; `getSnapshot` recomputes only when the version,
 *   the bridge identity, or the selector changed, so React's `Object.is`
 *   check never sees a gratuitous new object (no render loops).
 * - Immutable snapshots: selectors return fresh copies (new containers +
 *   shallow-cloned entry objects) because collectors mutate bridge entries in
 *   place (`lastUsed`, running averages).
 * - SSR-safe: no `window` access at module scope; `getServerSnapshot` returns
 *   the frozen inert constant.
 * - Late-enable: `subscribe` registers with both `bridge.subscribe()` and the
 *   package-internal lifecycle signal, re-checking `window` on every signal so
 *   a bridge created after mount is attached without a remount.
 *
 * @packageDocumentation
 * @internal
 */

import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { DevToolsBridge } from '../types.js';
import { onBridgeLifecycle } from '../lifecycle.js';

/**
 * Read the current bridge from `window`, SSR-safe.
 *
 * @returns The bridge, or `null` outside a browser / before `enableDevTools()`
 * @internal
 */
export function getBridge(): DevToolsBridge | null {
  return typeof window !== 'undefined' ? window.__LOCALMODE_DEVTOOLS__ ?? null : null;
}

/** Cached snapshot keyed by version + bridge identity + selector identity. */
interface SnapshotCache<T> {
  version: number;
  bridge: DevToolsBridge | null;
  select: (bridge: DevToolsBridge) => T;
  value: T;
}

/**
 * Subscribe to a slice of the devtools bridge.
 *
 * @param select - Pure selector producing a fresh immutable copy of the slice.
 *   Must be referentially stable across renders unless its inputs changed
 *   (module-level function, or `useCallback` keyed on normalized options) —
 *   a new selector identity invalidates the snapshot cache.
 * @param inert - Frozen module-level constant returned when no bridge exists
 *   (and as the server snapshot)
 * @returns The current slice snapshot
 * @internal
 */
export function useDevToolsSlice<T>(select: (bridge: DevToolsBridge) => T, inert: T): T {
  // Bumped on every bridge notification / lifecycle signal for this hook instance.
  const versionRef = useRef(0);
  const cacheRef = useRef<SnapshotCache<T> | null>(null);

  const subscribe = useCallback((onStoreChange: () => void) => {
    let unsubscribeBridge: (() => void) | null = null;
    let subscribedBridge: DevToolsBridge | null = null;
    let active = true;

    const bump = () => {
      versionRef.current += 1;
      onStoreChange();
    };

    // (Re-)attach to whatever bridge is currently on window. Handles both
    // late enable (no bridge -> bridge) and re-enable (old bridge replaced).
    const sync = () => {
      if (!active) return;
      const bridge = getBridge();
      if (bridge === subscribedBridge) return;
      unsubscribeBridge?.();
      unsubscribeBridge = null;
      subscribedBridge = bridge;
      if (bridge) {
        unsubscribeBridge = bridge.subscribe(bump);
      }
    };

    sync();

    const unsubscribeLifecycle = onBridgeLifecycle(() => {
      if (!active) return;
      sync();
      bump();
    });

    return () => {
      active = false;
      unsubscribeLifecycle();
      unsubscribeBridge?.();
      unsubscribeBridge = null;
      subscribedBridge = null;
    };
  }, []);

  const getSnapshot = useCallback(() => {
    const bridge = getBridge();
    const cache = cacheRef.current;
    if (
      cache !== null &&
      cache.version === versionRef.current &&
      cache.bridge === bridge &&
      cache.select === select
    ) {
      return cache.value;
    }
    const value = bridge ? select(bridge) : inert;
    cacheRef.current = { version: versionRef.current, bridge, select, value };
    return value;
  }, [select, inert]);

  const getServerSnapshot = useCallback(() => inert, [inert]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Shallow-clone a record of entry objects. Collectors mutate entries in
 * place (e.g. `ModelCacheInfo.lastUsed`, `VectorDBSnapshot` running
 * averages), so each snapshot clones every entry.
 *
 * @param record - The live bridge record
 * @returns A new record with shallow-cloned entries
 * @internal
 */
export function cloneRecord<T extends object>(record: Record<string, T>): Record<string, T> {
  const copy: Record<string, T> = {};
  for (const key of Object.keys(record)) {
    copy[key] = { ...record[key] };
  }
  return copy;
}

/**
 * Frozen inert empty record, shared by the record-slice hooks (design D6).
 * Referentially stable so no-bridge renders never produce new objects.
 *
 * @internal
 */
export const INERT_EMPTY_RECORD: Record<string, never> = Object.freeze({});
