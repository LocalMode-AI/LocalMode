/**
 * @file use-embed-many.ts
 * @description Hook for batch embedding with progress tracking
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { EmbeddingModel, EmbedManyResult } from '@localmode/core';

const IS_SERVER = typeof window === 'undefined';

/** Options for the useEmbedMany hook */
interface UseEmbedManyOptions {
  /** The embedding model to use */
  model: EmbeddingModel;
  /** Batch size for streaming embed (default: 32) */
  batchSize?: number;
}

/**
 * Hook for embedding multiple text values with progress tracking.
 *
 * @param options - Embedding model configuration
 * @returns Operation state with progress and execute(values: string[]) function
 *
 * @example
 * ```ts
 * const { data, isLoading, progress, execute } = useEmbedMany({ model });
 * await execute(['Hello', 'World']);
 * // progress = { completed: 2, total: 2 }
 * ```
 */
export function useEmbedMany(options: UseEmbedManyOptions) {
  const { model, batchSize = 32 } = options;

  const [data, setData] = useState<EmbedManyResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const execute = useCallback(async (values: string[]): Promise<EmbedManyResult | null> => {
    if (IS_SERVER) return null;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setError(null);
    setIsLoading(true);
    setProgress({ completed: 0, total: values.length });

    try {
      const { streamEmbedMany } = await import('@localmode/core');
      const embeddings: Float32Array[] = new Array(values.length);
      let totalTokens = 0;
      let responseModelId = model.modelId;

      for await (const item of streamEmbedMany({
        model,
        values,
        batchSize,
        abortSignal: controller.signal,
        onBatch: (p) => {
          if (mountedRef.current) {
            setProgress({ completed: Math.min(p.index + p.count, values.length), total: p.total });
          }
          totalTokens += p.usage?.tokens ?? 0;
        },
      })) {
        embeddings[item.index] = item.embedding;
      }

      if (!mountedRef.current || controller.signal.aborted) return null;

      const result: EmbedManyResult = {
        embeddings,
        usage: { tokens: totalTokens },
        response: { modelId: responseModelId, timestamp: new Date() },
      };

      setData(result);
      setProgress({ completed: values.length, total: values.length });
      setIsLoading(false);
      return result;
    } catch (err) {
      if (!mountedRef.current) return null;
      if (err instanceof Error && err.name === 'AbortError') {
        setIsLoading(false);
        return null;
      }
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsLoading(false);
      return null;
    }
  }, [model, batchSize]);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    setData(null);
    setError(null);
    setIsLoading(false);
    setProgress(null);
  }, []);

  if (IS_SERVER) {
    return {
      data: null, error: null, isLoading: false, progress: null,
      execute: (async () => null) as (values: string[]) => Promise<EmbedManyResult | null>,
      cancel: () => {}, reset: () => {},
    };
  }

  return { data, error, isLoading, progress, execute, cancel, reset };
}
