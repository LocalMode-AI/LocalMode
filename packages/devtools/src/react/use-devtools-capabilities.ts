/**
 * Device capabilities snapshot hook.
 *
 * @packageDocumentation
 */

import type { DevToolsBridge, DeviceCapabilitiesSnapshot } from '../types.js';
import { useDevToolsSlice } from './use-devtools-slice.js';

/** Clone the capabilities snapshot (container + nested records) or pass through `null`. */
const selectCapabilities = (bridge: DevToolsBridge): DeviceCapabilitiesSnapshot | null =>
  bridge.capabilities
    ? {
        browser: { ...bridge.capabilities.browser },
        device: { ...bridge.capabilities.device },
        hardware: { ...bridge.capabilities.hardware },
        features: { ...bridge.capabilities.features },
        storage: { ...bridge.capabilities.storage },
      }
    : null;

/**
 * Subscribe to the device capabilities snapshot detected once when
 * `enableDevTools()` runs (`detectCapabilities()` from `@localmode/core`).
 *
 * Returns a fresh immutable copy per bridge notification (container and
 * nested records cloned), or `null` while detection has not completed (or
 * failed).
 *
 * SSR-safe (`null` on the server), inert (`null`) when devtools was never
 * enabled, and attaches to a bridge created after mount.
 *
 * @returns The latest `DeviceCapabilitiesSnapshot`, or `null`
 *
 * @example
 * ```tsx
 * import { useDevToolsCapabilities } from '@localmode/devtools/react';
 *
 * function DeviceGrid() {
 *   const caps = useDevToolsCapabilities();
 *   if (!caps) return <p>Detecting…</p>;
 *   return <p>WebGPU: {caps.features.webgpu ? 'yes' : 'no'}</p>;
 * }
 * ```
 *
 * @see useDevToolsStorage for the storage quota slice
 */
export function useDevToolsCapabilities(): DeviceCapabilitiesSnapshot | null {
  return useDevToolsSlice(selectCapabilities, null);
}
