/**
 * @file use-reindex.ts
 * @description Hook for re-embedding documents after embedding model drift detection
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type {
  VectorDB,
  EmbeddingModel,
  ReindexProgress,
  ReindexResult,
  ReindexOptions,
} from '@localmode/core';

/** Options for the useReindex hook */
export interface UseReindexOptions {
  /** The VectorDB instance to reindex */
  db: VectorDB;
  /** The new embedding model to re-embed with */
  model: EmbeddingModel;
  /** Number of documents per batch (default: 50) */
  batchSize?: number;
  /** Custom text extractor for documents without standard _text metadata */
  textExtractor?: ReindexOptions['textExtractor'];
  /** Inference queue for background scheduling */
  queue?: ReindexOptions['queue'];
}

/** Return type from useReindex */
export interface UseReindexReturn {
  /** Whether reindexing is in progress */
  isReindexing: boolean;
  /** Current progress (null if not started) */
  progress: ReindexProgress | null;
  /** Error if reindex failed (null otherwise) */
  error: { message: string } | null;
  /** Start reindexing */
  reindex: () => Promise<ReindexResult | null>;
  /** Cancel the current reindex operation */
  cancel: () => void;
  /** Clear the error state */
  clearError: () => void;
}

const IS_SERVER = typeof window === 'undefined';

/**
 * Hook for re-embedding documents in a VectorDB collection with a new model.
 *
 * Wraps `reindexCollection()` with React state management for progress,
 * loading, error handling, and cancellation.
 *
 * @param options - Reindex configuration
 * @returns State and actions for controlling the reindex operation
 *
 * @example
 * ```tsx
 * const { isReindexing, progress, error, reindex, cancel } = useReindex({
 *   db,
 *   model: newEmbeddingModel,
 * });
 *
 * return (
 *   <div>
 *     {isReindexing && progress && (
 *       <p>{progress.completed}/{progress.total} ({progress.phase})</p>
 *     )}
 *     <button onClick={reindex} disabled={isReindexing}>Reindex</button>
 *     <button onClick={cancel} disabled={!isReindexing}>Cancel</button>
 *     {error && <p>Error: {error.message}</p>}
 *   </div>
 * );
 * ```
 */
export function useReindex(options: UseReindexOptions): UseReindexReturn {
  const { db, model, batchSize, textExtractor, queue } = options;

  const [isReindexing, setIsReindexing] = useState(false);
  const [progress, setProgress] = useState<ReindexProgress | null>(null);
  const [error, setError] = useState<{ message: string } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const reindex = useCallback(async (): Promise<ReindexResult | null> => {
    if (IS_SERVER) return null;

    // Abort any previous operation
    abortControllerRef.current?.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setError(null);
    setIsReindexing(true);
    setProgress(null);

    try {
      const { reindexCollection } = await import('@localmode/core');
      const result = await reindexCollection(db, model, {
        abortSignal: controller.signal,
        batchSize,
        textExtractor,
        queue,
        onProgress: (p) => {
          if (mountedRef.current && !controller.signal.aborted) {
            setProgress({ ...p });
          }
        },
      });

      if (mountedRef.current && !controller.signal.aborted) {
        setIsReindexing(false);
        return result;
      }
      return null;
    } catch (err) {
      if (!mountedRef.current) return null;

      // Abort errors are silent
      if (err instanceof DOMException && err.name === 'AbortError') {
        setIsReindexing(false);
        return null;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        setIsReindexing(false);
        return null;
      }

      const message = err instanceof Error ? err.message : String(err);
      setError({ message });
      setIsReindexing(false);
      return null;
    }
  }, [db, model, batchSize, textExtractor, queue]);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // SSR: return inert state
  if (IS_SERVER) {
    return {
      isReindexing: false,
      progress: null,
      error: null,
      reindex: async () => null,
      cancel: () => {},
      clearError: () => {},
    };
  }

  return { isReindexing, progress, error, reindex, cancel, clearError };
}
