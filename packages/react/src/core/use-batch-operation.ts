/**
 * @file use-batch-operation.ts
 * @description Base hook for concurrent batch operations with shared AbortSignal
 */

import { useState, useRef, useCallback, useEffect } from 'react';

/** Configuration for useBatchOperation */
interface UseBatchOperationConfig<TItem, TResult> {
  /** Async function that processes a single item */
  fn: (item: TItem, signal: AbortSignal) => Promise<TResult>;
  /** Maximum concurrent operations (default: Infinity — all run in parallel) */
  concurrency?: number;
}

/** Progress tracking for batch operations */
export interface BatchProgress {
  /** Number of items completed (success + error) */
  completed: number;
  /** Total number of items */
  total: number;
  /** Number of items that succeeded */
  succeeded: number;
  /** Number of items that failed */
  failed: number;
}

/** Result for a single item in the batch */
export interface BatchItemResult<TResult> {
  /** Index of the item in the original array */
  index: number;
  /** Result if successful */
  data: TResult | null;
  /** Error if failed */
  error: Error | null;
}

/** Return type from useBatchOperation */
export interface UseBatchOperationReturn<TItem, TResult> {
  /** All item results from the last batch execution */
  results: BatchItemResult<TResult>[];
  /** Whether the batch is currently running */
  isRunning: boolean;
  /** Batch progress */
  progress: BatchProgress | null;
  /** Error if the entire batch failed (not per-item errors) */
  error: Error | null;
  /** Execute the batch on an array of items */
  execute: (items: TItem[]) => Promise<BatchItemResult<TResult>[]>;
  /** Cancel all running operations */
  cancel: () => void;
  /** Reset all state */
  reset: () => void;
}

const IS_SERVER = typeof window === 'undefined';

/**
 * Base hook for concurrent batch processing.
 * Runs a function on each item in parallel (with optional concurrency limit),
 * tracks per-item results and overall progress, and supports cancellation
 * via a shared AbortSignal.
 *
 * Unlike useOperation, calling execute() on a new batch does NOT auto-abort
 * the previous batch — call cancel() explicitly if needed.
 *
 * @internal Not exported from the public API — used by domain batch hooks
 */
export function useBatchOperation<TItem, TResult>(
  config: UseBatchOperationConfig<TItem, TResult>
): UseBatchOperationReturn<TItem, TResult> {
  const { concurrency = Infinity } = config;

  const [results, setResults] = useState<BatchItemResult<TResult>[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
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

  const execute = useCallback(
    async (items: TItem[]): Promise<BatchItemResult<TResult>[]> => {
      if (IS_SERVER) return [];

      // Cancel previous batch
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const total = items.length;
      const itemResults: BatchItemResult<TResult>[] = new Array(total);
      let succeeded = 0;
      let failed = 0;
      let completed = 0;

      setError(null);
      setResults([]);
      setIsRunning(true);
      setProgress({ completed: 0, total, succeeded: 0, failed: 0 });

      const processItem = async (item: TItem, index: number) => {
        if (controller.signal.aborted) {
          itemResults[index] = { index, data: null, error: new Error('Aborted') };
          return;
        }

        try {
          const data = await fnRef.current(item, controller.signal);
          itemResults[index] = { index, data, error: null };
          succeeded++;
        } catch (err) {
          if (controller.signal.aborted) {
            itemResults[index] = { index, data: null, error: new Error('Aborted') };
            return;
          }
          itemResults[index] = {
            index,
            data: null,
            error: err instanceof Error ? err : new Error(String(err)),
          };
          failed++;
        }

        completed++;
        if (mountedRef.current) {
          setProgress({ completed, total, succeeded, failed });
        }
      };

      try {
        if (concurrency === Infinity) {
          // Run all in parallel
          await Promise.all(items.map((item, i) => processItem(item, i)));
        } else {
          // Run with concurrency limit
          let running = 0;
          let nextIndex = 0;

          await new Promise<void>((resolve) => {
            const startNext = () => {
              while (running < concurrency && nextIndex < total && !controller.signal.aborted) {
                const idx = nextIndex++;
                running++;
                processItem(items[idx], idx).then(() => {
                  running--;
                  if (nextIndex >= total && running === 0) {
                    resolve();
                  } else {
                    startNext();
                  }
                });
              }
              if (nextIndex >= total && running === 0) {
                resolve();
              }
            };
            startNext();
          });
        }

        if (mountedRef.current) {
          setResults(itemResults);
          setIsRunning(false);
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsRunning(false);
        }
      }

      return itemResults;
    },
    [concurrency]
  );

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    setResults([]);
    setProgress(null);
    setError(null);
    setIsRunning(false);
  }, []);

  if (IS_SERVER) {
    return {
      results: [],
      isRunning: false,
      progress: null,
      error: null,
      execute: async () => [],
      cancel: () => {},
      reset: () => {},
    };
  }

  return { results, isRunning, progress, error, execute, cancel, reset };
}
