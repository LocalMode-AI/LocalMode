/**
 * @file use-capabilities.ts
 * @description Hook for detecting device capabilities
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { DeviceCapabilities } from '@localmode/core';

const IS_SERVER = typeof window === 'undefined';

/**
 * Hook for detecting browser/device AI capabilities.
 * Runs detection once on mount; call `refresh()` to re-detect.
 *
 * @returns Capabilities (typed `DeviceCapabilities` with `browser`, `device`,
 * `hardware`, `features`, and `storage` sub-objects), detection state,
 * detection error, and a `refresh()` function
 *
 * @example
 * ```tsx
 * import { useCapabilities } from '@localmode/react';
 *
 * function DeviceInfo() {
 *   const { capabilities, isDetecting, error, refresh } = useCapabilities();
 *   if (isDetecting) return <span>Detecting…</span>;
 *   if (error) return <button onClick={refresh}>Retry detection</button>;
 *   return <span>WebGPU: {capabilities?.features.webgpu ? 'yes' : 'no'}</span>;
 * }
 * ```
 */
export function useCapabilities() {
  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const detect = useCallback(async () => {
    if (IS_SERVER) return;

    setIsDetecting(true);
    setError(null);
    try {
      const { detectCapabilities } = await import('@localmode/core');
      const caps = await detectCapabilities();
      if (mountedRef.current) {
        setCapabilities(caps);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (mountedRef.current) {
        setIsDetecting(false);
      }
    }
  }, []);

  useEffect(() => {
    void detect();
  }, [detect]);

  if (IS_SERVER) {
    return { capabilities: null, isDetecting: false, error: null, refresh: async () => {} };
  }

  return { capabilities, isDetecting, error, refresh: detect };
}
