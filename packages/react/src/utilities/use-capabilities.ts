/**
 * @file use-capabilities.ts
 * @description Hook for detecting device capabilities
 */

import { useState, useEffect, useRef } from 'react';

const IS_SERVER = typeof window === 'undefined';

/**
 * Hook for detecting browser/device AI capabilities.
 * Runs detection once on mount.
 *
 * @returns Capabilities object and detection state
 */
export function useCapabilities() {
  const [capabilities, setCapabilities] = useState<Record<string, unknown> | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (IS_SERVER) return;

    setIsDetecting(true);
    import('@localmode/core')
      .then(({ detectCapabilities }) => detectCapabilities())
      .then((caps) => {
        if (mountedRef.current) {
          setCapabilities(caps as unknown as Record<string, unknown>);
          setIsDetecting(false);
        }
      })
      .catch(() => {
        if (mountedRef.current) {
          setIsDetecting(false);
        }
      });
  }, []);

  if (IS_SERVER) {
    return { capabilities: null, isDetecting: false };
  }

  return { capabilities, isDetecting };
}
