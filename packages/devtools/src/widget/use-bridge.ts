/**
 * @file use-bridge.ts
 * @description React hook for subscribing to the DevTools bridge data.
 */

import { useState, useEffect } from 'react';
import type { DevToolsBridge } from '../types.js';

/**
 * Subscribe to the DevTools bridge on `window.__LOCALMODE_DEVTOOLS__`.
 *
 * Uses `bridge.subscribe()` for instant, non-polling updates.
 * Returns `null` when the bridge is not available.
 *
 * @returns The current DevToolsBridge or null
 */
export function useBridge(): DevToolsBridge | null {
  const [bridge, setBridge] = useState<DevToolsBridge | null>(
    () => (typeof window !== 'undefined' ? window.__LOCALMODE_DEVTOOLS__ ?? null : null)
  );
  const [, setTick] = useState(0);

  useEffect(() => {
    const b = typeof window !== 'undefined' ? window.__LOCALMODE_DEVTOOLS__ : undefined;
    if (!b) return;

    if (bridge !== b) {
      setBridge(b);
    }

    return b.subscribe(() => {
      setTick((n) => n + 1);
    });
  }, [bridge]);

  return bridge;
}
