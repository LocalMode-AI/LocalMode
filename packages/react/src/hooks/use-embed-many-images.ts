/**
 * @file use-embed-many-images.ts
 * @description Hook for batch image embedding with progress tracking
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { MultimodalEmbeddingModel, EmbedManyImagesResult, ImageInput } from '@localmode/core';

const IS_SERVER = typeof window === 'undefined';

/** Options for the useEmbedManyImages hook */
interface UseEmbedManyImagesOptions {
  /** The multimodal embedding model to use */
  model: MultimodalEmbeddingModel;
  /** Batch size for streaming embed (default: 32) */
  batchSize?: number;
}

/**
 * Hook for embedding multiple images with progress tracking.
 *
 * @param options - Multimodal embedding model configuration
 * @returns Operation state with progress and execute(images: ImageInput[]) function
 *
 * @example
 * ```tsx
 * const { data, isLoading, progress, execute } = useEmbedManyImages({
 *   model: transformers.multimodalEmbedding('Xenova/clip-vit-base-patch32'),
 * });
 * await execute([imageBlob1, imageBlob2]);
 * // progress = { completed: 2, total: 2 }
 * // data = { embeddings: [Float32Array, Float32Array], usage: { ... } }
 * ```
 */
export function useEmbedManyImages(options: UseEmbedManyImagesOptions) {
  const { model, batchSize = 32 } = options;

  const [data, setData] = useState<EmbedManyImagesResult | null>(null);
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

  const execute = useCallback(async (images: ImageInput[]): Promise<EmbedManyImagesResult | null> => {
    if (IS_SERVER) return null;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setError(null);
    setIsLoading(true);
    setProgress({ completed: 0, total: images.length });

    try {
      const { streamEmbedManyImages } = await import('@localmode/core');
      const embeddings: Float32Array[] = new Array(images.length);
      let totalTokens = 0;
      const responseModelId = model.modelId;

      for await (const item of streamEmbedManyImages({
        model,
        images,
        batchSize,
        abortSignal: controller.signal,
        onBatch: (p) => {
          if (mountedRef.current) {
            setProgress({ completed: Math.min(p.index + p.count, images.length), total: p.total });
          }
          totalTokens += p.usage?.tokens ?? 0;
        },
      })) {
        embeddings[item.index] = item.embedding;
      }

      if (!mountedRef.current || controller.signal.aborted) return null;

      const result: EmbedManyImagesResult = {
        embeddings,
        usage: { tokens: totalTokens },
        response: { modelId: responseModelId, timestamp: new Date() },
      };

      setData(result);
      setProgress({ completed: images.length, total: images.length });
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
      execute: (async () => null) as (images: ImageInput[]) => Promise<EmbedManyImagesResult | null>,
      cancel: () => {}, reset: () => {},
    };
  }

  return { data, error, isLoading, progress, execute, cancel, reset };
}
