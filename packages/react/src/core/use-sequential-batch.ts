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
  /** Results from the last batch (null for failed/skipped items) */
  results: (TOutput | null)[];
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
 * as `null` in the results array. Cancellation stops after the current item.
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
 * // batch.progress updates as each item completes
 * ```
 */
export function useSequentialBatch<TInput, TOutput>(
  config: UseSequentialBatchConfig<TInput, TOutput>
): UseSequentialBatchReturn<TInput, TOutput> {
  const [results, setResults] = useState<(TOutput | null)[]>([]);
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

    const collected: (TOutput | null)[] = [];

    try {
      for (let i = 0; i < inputs.length; i++) {
        if (controller.signal.aborted || !mountedRef.current) break;

        try {
          const result = await fnRef.current(inputs[i], controller.signal);
          if (!mountedRef.current) break;
          collected.push(result);
        } catch (err) {
          if (!mountedRef.current) break;
          // Abort = stop entire batch
          if (err instanceof Error && (err.name === 'AbortError' || (err instanceof DOMException && err.name === 'AbortError'))) {
            break;
          }
          // Per-item error = null, continue
          collected.push(null);
        }

        if (mountedRef.current) {
          setProgress({ current: i + 1, total: inputs.length });
        }
      }
    } catch (err) {
      if (mountedRef.current && !(err instanceof Error && err.name === 'AbortError')) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (mountedRef.current) {
        setResults(collected);
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
    setProgress({ current: 0, total: 0 });
    setIsRunning(false);
    setError(null);
  }, []);

  if (IS_SERVER) {
    return {
      results: [],
      progress: { current: 0, total: 0 },
      isRunning: false,
      error: null,
      execute: async () => [],
      cancel: () => {},
      reset: () => {},
    };
  }

  return { results, progress, isRunning, error, execute, cancel, reset };
}
