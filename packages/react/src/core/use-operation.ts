/**
 * @file use-operation.ts
 * @description Base hook for single async operations with AbortController lifecycle
 */

import { useState, useRef, useCallback, useEffect } from 'react';

/** Options for configuring useOperation */
interface UseOperationConfig<TInput extends unknown[], TOutput> {
  /** The async function to execute */
  fn: (...args: [...TInput, AbortSignal]) => Promise<TOutput>;
}

/** Return type from useOperation */
export interface UseOperationReturn<TInput extends unknown[], TOutput> {
  data: TOutput | null;
  error: Error | null;
  isLoading: boolean;
  execute: (...args: TInput) => Promise<TOutput | null>;
  cancel: () => void;
  reset: () => void;
}

const IS_SERVER = typeof window === 'undefined';

/**
 * Base hook for any single async operation.
 * Manages data/error/isLoading state, AbortController lifecycle,
 * auto-abort on re-execute and unmount.
 *
 * @internal Not exported from the public API
 */
export function useOperation<TInput extends unknown[], TOutput>(
  config: UseOperationConfig<TInput, TOutput>
): UseOperationReturn<TInput, TOutput> {
  const [data, setData] = useState<TOutput | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const fnRef = useRef(config.fn);
  fnRef.current = config.fn;

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const execute = useCallback(async (...args: TInput): Promise<TOutput | null> => {
    if (IS_SERVER) return null;

    // Abort any previous operation
    abortControllerRef.current?.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setError(null);
    setIsLoading(true);

    try {
      const result = await fnRef.current(...args, controller.signal);
      if (mountedRef.current && !controller.signal.aborted) {
        setData(result);
        setIsLoading(false);
        return result;
      }
      return null;
    } catch (err) {
      if (!mountedRef.current) return null;

      // Abort errors are silent
      if (err instanceof DOMException && err.name === 'AbortError') {
        setIsLoading(false);
        return null;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        setIsLoading(false);
        return null;
      }

      setError(err instanceof Error ? err : new Error(String(err)));
      setIsLoading(false);
      return null;
    }
  }, []);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    setData(null);
    setError(null);
    setIsLoading(false);
  }, []);

  // SSR: return inert state
  if (IS_SERVER) {
    return {
      data: null,
      error: null,
      isLoading: false,
      execute: (async () => null) as unknown as (...args: TInput) => Promise<TOutput | null>,
      cancel: () => {},
      reset: () => {},
    };
  }

  return { data, error, isLoading, execute, cancel, reset };
}
