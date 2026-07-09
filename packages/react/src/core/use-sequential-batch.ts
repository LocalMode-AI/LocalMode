/**
 * @file use-sequential-batch.ts
 * @description Hook for processing items sequentially with progress tracking and cancellation
 */

import { useState, useRef, useCallback, useEffect } from 'react';

const IS_SERVER = typeof window === 'undefined';

/** Configuration for useSequentialBatch */
interface UseSequentialBatchConfig<TInput, TOutput> {
  /** Async function that processes a single item */
  fn: (input: TInput, signal: AbortSignal) => Promise<TOutput>;
}

/** Progress tracking for sequential batch */
export interface SequentialBatchProgress {
  /** Number of items completed so far */
  current: number;
  /** Total number of items */
  total: number;
}

/** Return type from useSequentialBatch */
export interface UseSequentialBatchReturn<TInput, TOutput> {
  /**
   * Results from the current/last batch (null for failed/skipped items).
   * Published incrementally as each item completes — not only at batch end.
   */
  results: (TOutput | null)[];
  /**
   * Per-item errors, index-aligned with `results`: `itemErrors[i]` is the
   * Error that made `results[i]` null, or null if item `i` succeeded.
   * Published incrementally alongside `results`.
   */
  itemErrors: (Error | null)[];
  /** Progress of the current batch */
  progress: SequentialBatchProgress;
  /** Whether a batch is currently running */
  isRunning: boolean;
  /** Error from overall batch failure (not per-item) */
  error: Error | null;
  /** Process an array of inputs sequentially */
  execute: (inputs: TInput[]) => Promise<(TOutput | null)[]>;
  /** Cancel the current batch (completes current item, stops processing) */
  cancel: () => void;
  /** Reset all state */
  reset: () => void;
}

/**
 * Hook for processing an array of items sequentially with progress tracking.
 *
 * Each item is processed one at a time in order. Per-item errors are captured
 * as `null` in the results array, with the underlying Error retained in the
 * index-aligned `itemErrors` array. Both arrays are published incrementally
 * as items complete. Cancellation stops after the current item.
 *
 * @param config - The async function to process each item
 * @returns Batch state with execute/cancel/reset
 *
 * @example
 * ```ts
 * const batch = useSequentialBatch({
 *   fn: (text, signal) => classify({ model, text, abortSignal: signal }),
 * });
 * const results = await batch.execute(['hello', 'world']);
 * // batch.results / batch.progress update as each item completes;
 * // batch.itemErrors[i] holds the Error when results[i] is null
 * ```
 */
export function useSequentialBatch<TInput, TOutput>(
  config: UseSequentialBatchConfig<TInput, TOutput>
): UseSequentialBatchReturn<TInput, TOutput> {
  const [results, setResults] = useState<(TOutput | null)[]>([]);
  const [itemErrors, setItemErrors] = useState<(Error | null)[]>([]);
  const [progress, setProgress] = useState<SequentialBatchProgress>({ current: 0, total: 0 });
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const fnRef = useRef(config.fn);
  fnRef.current = config.fn;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const execute = useCallback(async (inputs: TInput[]): Promise<(TOutput | null)[]> => {
    if (IS_SERVER || inputs.length === 0) return [];

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setError(null);
    setIsRunning(true);
    setProgress({ current: 0, total: inputs.length });
    setResults([]);
    setItemErrors([]);

    const collected: (TOutput | null)[] = [];
    const collectedErrors: (Error | null)[] = [];

    try {
      for (let i = 0; i < inputs.length; i++) {
        if (controller.signal.aborted || !mountedRef.current) break;

        try {
          const result = await fnRef.current(inputs[i], controller.signal);
          if (!mountedRef.current) break;
          collected.push(result);
          collectedErrors.push(null);
        } catch (err) {
          if (!mountedRef.current) break;
          // Abort = stop entire batch
          if (err instanceof Error && (err.name === 'AbortError' || (err instanceof DOMException && err.name === 'AbortError'))) {
            break;
          }
          // Per-item error = null result, Error retained in itemErrors, continue
          collected.push(null);
          collectedErrors.push(err instanceof Error ? err : new Error(String(err)));
        }

        if (mountedRef.current) {
          setProgress({ current: i + 1, total: inputs.length });
          // Publish incrementally so consumers see results as they arrive
          setResults([...collected]);
          setItemErrors([...collectedErrors]);
        }
      }
    } catch (err) {
      if (mountedRef.current && !(err instanceof Error && err.name === 'AbortError')) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (mountedRef.current) {
        setResults(collected);
        setItemErrors(collectedErrors);
        setIsRunning(false);
      }
    }

    return collected;
  }, []);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    setResults([]);
    setItemErrors([]);
    setProgress({ current: 0, total: 0 });
    setIsRunning(false);
    setError(null);
  }, []);

  if (IS_SERVER) {
    return {
      results: [],
      itemErrors: [],
      progress: { current: 0, total: 0 },
      isRunning: false,
      error: null,
      execute: async () => [],
      cancel: () => {},
      reset: () => {},
    };
  }

  return { results, itemErrors, progress, isRunning, error, execute, cancel, reset };
}
