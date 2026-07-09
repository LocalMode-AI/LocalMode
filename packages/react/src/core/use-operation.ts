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

      // Aborts are silent. Rejections from an operation whose own controller
      // was aborted are cancellation outcomes even when a core function wraps
      // the abort in a plain Error (e.g. rerank()'s "Reranking was cancelled")
      // — symmetric with the success path discarding results after abort.
      // Loading state is only reset when this operation is still the current
      // one: a superseded call's late rejection (its controller was aborted
      // by re-execute) must not flip the in-flight replacement back to idle.
      const isAbortOutcome =
        controller.signal.aborted ||
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError');
      if (isAbortOutcome) {
        if (abortControllerRef.current === controller) {
          setIsLoading(false);
        }
        return null;
      }

      setError(err instanceof Error ? err : new Error(String(err)));
      setIsLoading(false);
      return null;
    }
  }, []);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    // Return to idle immediately: the cancelled operation's outcome is
    // discarded by both settle paths above, and some providers cannot observe
    // the abort mid-compute (e.g. a single non-interruptible in-worker call
    // that RESOLVES long after cancellation) — the UI must not stay "loading"
    // until (or worse, after) the abandoned work drains.
    if (mountedRef.current) {
      setIsLoading(false);
    }
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
