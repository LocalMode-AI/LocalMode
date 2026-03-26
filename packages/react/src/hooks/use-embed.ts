/**
 * @file use-embed.ts
 * @description Hook for single-value embedding with @localmode/core embed()
 */

import type { EmbeddingModel, EmbedResult } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useEmbed hook */
interface UseEmbedOptions {
  /** The embedding model to use */
  model: EmbeddingModel;
}

/**
 * Hook for embedding a single text value.
 *
 * @param options - Embedding model configuration
 * @returns Operation state with execute(value: string) function
 *
 * @example
 * ```tsx
 * const { data, isLoading, execute } = useEmbed({
 *   model: transformers.embedding('Xenova/all-MiniLM-L6-v2'),
 * });
 * await execute('Hello world');
 * // data = { embedding: Float32Array, usage: { tokens: 2 }, response: { ... } }
 * ```
 */
export function useEmbed(options: UseEmbedOptions) {
  const { model } = options;

  return useOperation<[string], EmbedResult>({
    fn: async (value: string, signal: AbortSignal) => {
      const { embed } = await import('@localmode/core');
      return embed({ model, value, abortSignal: signal });
    },
  });
}
