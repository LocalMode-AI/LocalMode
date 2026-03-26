/**
 * @file use-semantic-chunk.ts
 * @description Hook for semantic (embedding-aware) text chunking with @localmode/core semanticChunk()
 */

import type { EmbeddingModel, Chunk } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useSemanticChunk hook */
interface UseSemanticChunkOptions {
  /** The embedding model for computing segment similarities */
  model: EmbeddingModel;
  /** Similarity threshold for breakpoint detection (0-1). Default: auto-detected */
  threshold?: number;
  /** Target maximum chunk size in characters (default: 2000) */
  size?: number;
  /** Minimum chunk size in characters (default: 100) */
  minSize?: number;
  /** Target size for initial sentence segments in characters (default: 200) */
  segmentSize?: number;
  /** Custom separators for the initial sentence split */
  sentenceSeparators?: string[];
}

/**
 * Hook for semantic (embedding-aware) text chunking.
 *
 * Splits text at points where embedding similarity between adjacent
 * segments drops, producing topically coherent chunks.
 *
 * @param options - Semantic chunking configuration (model is required)
 * @returns Operation state with execute(text) function
 *
 * @example
 * ```ts
 * const { data, isLoading, execute, cancel } = useSemanticChunk({
 *   model: transformers.embedding('Xenova/bge-small-en-v1.5'),
 *   threshold: 0.4,
 * });
 *
 * await execute('Long document text...');
 * // data contains Chunk[] with semantic boundary metadata
 * ```
 */
export function useSemanticChunk(options: UseSemanticChunkOptions) {
  const { model, threshold, size, minSize, segmentSize, sentenceSeparators } = options;

  return useOperation<[string], Chunk[]>({
    fn: async (text: string, signal: AbortSignal) => {
      const { semanticChunk } = await import('@localmode/core');
      return semanticChunk({
        text,
        model,
        threshold,
        size,
        minSize,
        segmentSize,
        sentenceSeparators,
        abortSignal: signal,
      });
    },
  });
}
