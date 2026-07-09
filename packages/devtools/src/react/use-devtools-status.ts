/**
 * DevTools availability/enabled status hook.
 *
 * @packageDocumentation
 */

import type { DevToolsBridge } from '../types.js';
import { useDevToolsSlice } from './use-devtools-slice.js';

/** Availability status of the devtools bridge (design D6). */
export interface DevToolsStatus {
  /** Whether a bridge object exists on `window` (i.e. `enableDevTools()` ran) */
  available: boolean;

  /** Whether instrumentation is currently active (`false` after `disableDevTools()`) */
  enabled: boolean;
}

/** Frozen inert status for SSR / no-bridge renders. */
const INERT_STATUS: DevToolsStatus = Object.freeze({ available: false, enabled: false });

/** Derive status from the live bridge. */
const selectStatus = (bridge: DevToolsBridge): DevToolsStatus => ({
  available: true,
  enabled: bridge.enabled,
});

/**
 * Subscribe to the devtools availability status.
 *
 * Distinguishes the three bridge states (design D6):
 * - never enabled / server render → `{ available: false, enabled: false }`
 * - enabled → `{ available: true, enabled: true }`
 * - disabled after use (`disableDevTools()`; bridge preserved on `window`
 *   for inspection) → `{ available: true, enabled: false }`
 *
 * Renders a "Connected/Disabled" status chip in your own observability UI.
 *
 * @returns The current `{ available, enabled }` status snapshot
 *
 * @example
 * ```tsx
 * import { useDevToolsStatus } from '@localmode/devtools/react';
 *
 * function StatusChip() {
 *   const { available, enabled } = useDevToolsStatus();
 *   if (!available) return <span>DevTools off</span>;
 *   return <span>{enabled ? 'Connected' : 'Disabled'}</span>;
 * }
 * ```
 *
 * @see useDevToolsBridge for the underlying bridge object
 */
export function useDevToolsStatus(): DevToolsStatus {
  return useDevToolsSlice(selectStatus, INERT_STATUS);
}
