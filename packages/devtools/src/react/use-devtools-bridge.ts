/**
 * Base bridge subscription hook.
 *
 * @packageDocumentation
 */

import type { DevToolsBridge } from '../types.js';
import { useDevToolsSlice } from './use-devtools-slice.js';

/** Version-keyed wrapper so every bridge notification re-renders consumers. */
interface BridgeSnapshot {
  bridge: DevToolsBridge | null;
}

/** Frozen inert wrapper for SSR / no-bridge renders. */
const INERT_BRIDGE_SNAPSHOT: BridgeSnapshot = Object.freeze({ bridge: null });

/** Wrap the live bridge in a fresh object per notification. */
const selectBridge = (bridge: DevToolsBridge): BridgeSnapshot => ({ bridge });

/**
 * Subscribe to the devtools bridge on `window.__LOCALMODE_DEVTOOLS__`.
 *
 * The base hook behind every slice hook. Re-renders the consumer on every
 * bridge notification and
 * returns the **live** bridge object — unlike the slice hooks, the returned
 * bridge is NOT an immutable copy (collectors mutate it in place between
 * renders). Prefer the slice hooks (`useDevToolsQueueStats()`,
 * `useDevToolsEvents()`, ...) for immutable, memoization-friendly snapshots.
 *
 * SSR-safe (renders `null` on the server), inert (`null`) when devtools was
 * never enabled, and attaches to a bridge created after mount when
 * `enableDevTools()` runs later in the same page.
 *
 * @returns The current `DevToolsBridge`, or `null` when devtools is not
 *   available (never enabled, or server render)
 *
 * @example
 * ```tsx
 * import { useDevToolsBridge } from '@localmode/devtools/react';
 *
 * function BridgeInspector() {
 *   const bridge = useDevToolsBridge();
 *   if (!bridge) return <p>DevTools not enabled</p>;
 *   return <p>Buffered events: {bridge.events.length}</p>;
 * }
 * ```
 *
 * @see useDevToolsStatus for a plain `{ available, enabled }` view
 * @see useDevToolsQueueStats and the other slice hooks for immutable snapshots
 */
export function useDevToolsBridge(): DevToolsBridge | null {
  return useDevToolsSlice(selectBridge, INERT_BRIDGE_SNAPSHOT).bridge;
}
