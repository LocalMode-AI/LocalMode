/**
 * @file test-utils.ts
 * @description Shared jsdom shims + settle helpers for the `tests/react/`
 * suite. Importing this module applies the shims (jsdom test files only —
 * `ssr.test.tsx` runs in the node environment and must NOT import it).
 *
 * Every shim here sits BELOW the claimed test boundary (hooks ↔ real bridge
 * ↔ real collectors ↔ core's public functions) and is documented per the
 * repo test-integrity allowlist rules.
 */

import { expect } from 'vitest';
import { enableDevTools } from '../../src/index.js';

// ---------------------------------------------------------------------------
// jsdom shim BELOW the claimed test boundary (allowlisted, decided per design
// D8): core's public `getStorageQuota()` reads `navigator.storage.estimate()`
// — a browser StorageManager API jsdom does not implement (verified:
// `navigator.storage` is undefined in jsdom 26). Without the shim the storage
// collector can never populate `bridge.storage` in jsdom. Real StorageManager
// coverage belongs to the real-Chrome verification tail (tasks 6.x).
// — devtools-react-hooks 5.1
// ---------------------------------------------------------------------------
export const SHIM_STORAGE_ESTIMATE = { usage: 250_000, quota: 1_000_000 };
Object.defineProperty(navigator, 'storage', {
  configurable: true,
  value: {
    estimate: async () => ({ ...SHIM_STORAGE_ESTIMATE }),
    persisted: async () => false,
  },
});

// ---------------------------------------------------------------------------
// jsdom shim BELOW the claimed test boundary (allowlisted): core's real
// `detectCapabilities()` → `detectGPU()` probes `canvas.getContext('webgl')`.
// jsdom implements no canvas contexts and logs a noisy "Not implemented"
// virtual-console error while returning undefined. Returning `null` is the
// spec-compliant "context unavailable" result (what a real browser without
// WebGL returns), so this shim only silences jsdom's not-implemented noise —
// core's null-handling path is the same one a WebGL-less browser takes.
// Real-GPU coverage belongs to the real-Chrome tail (tasks 6.x).
// — devtools-react-hooks 5.1
// ---------------------------------------------------------------------------
HTMLCanvasElement.prototype.getContext = (() =>
  null) as typeof HTMLCanvasElement.prototype.getContext;

/**
 * Wait (observing only the public bridge on `window`) until the initial async
 * collector writes — capabilities detection and the first storage poll — have
 * landed. Plain polling, no React involvement, so it can run inside `act()`.
 */
export async function waitForBridgeSettled(timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  for (;;) {
    const bridge = window.__LOCALMODE_DEVTOOLS__;
    if (bridge && bridge.capabilities !== null && bridge.storage !== null) return;
    if (Date.now() - start > timeoutMs) {
      expect.fail('real bridge did not settle (capabilities/storage) within timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/**
 * Enable devtools via the real public API, then wait for the initial async
 * collector writes to land BEFORE any hook mounts. Mounting hooks only after
 * the initial burst keeps every store notification they observe inside
 * act() (no React act warnings) without mocking anything.
 */
export async function enableDevToolsSettled(): Promise<void> {
  enableDevTools();
  await waitForBridgeSettled();
}
