/**
 * Capabilities collector — detects device capabilities once on init.
 *
 * @packageDocumentation
 */

import { detectCapabilities } from '@localmode/core';
import type { DevToolsBridge, CleanupFn } from '../types.js';

/**
 * Detect device capabilities and write to the bridge.
 *
 * @param bridge - The DevTools bridge object
 * @param notify - Function to notify subscribers
 * @returns Cleanup function (no-op for capabilities since it's a one-shot)
 */
export function startCapabilitiesCollector(
  bridge: DevToolsBridge,
  notify: () => void
): CleanupFn {
  detectCapabilities()
    .then((caps) => {
      bridge.capabilities = {
        browser: (caps.browser ?? {}) as Record<string, unknown>,
        device: (caps.device ?? {}) as Record<string, unknown>,
        hardware: (caps.hardware ?? {}) as Record<string, unknown>,
        features: (caps.features ?? {}) as Record<string, boolean>,
        storage: (caps.storage ?? {}) as Record<string, unknown>,
      };
      notify();
    })
    .catch(() => {
      bridge.capabilities = null;
    });

  return () => {
    /* one-shot, nothing to clean up */
  };
}
