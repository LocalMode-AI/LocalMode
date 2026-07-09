/**
 * @file use-rerank.ts
 * @description Hook for document reranking with @localmode/core rerank()
 */

import type { RerankerModel, RerankResult } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useRerank hook */
export interface UseRerankOptions {
  /** The reranker model to use */
  model: RerankerModel;
  /** Number of top results to return (default: all); a per-call `topK` on the execute input overrides this */
  topK?: number;
}

/** Input for reranking */
export interface RerankInput {
  /** The query to rank documents against */
  query: string;
  /** Documents to rerank */
  documents: string[];
  /** Per-call override of the hook-level `topK` option */
  topK?: number;
}

/**
 * Hook for reranking documents by relevance to a query.
 *
 * Hook-level `topK` applies to every call and can be overridden per call via
 * the execute input; when neither is set, all documents are returned ranked.
 *
 * @param options - Reranker model configuration
 * @returns Operation state with execute({ query, documents }) function
 *
 * @example
 * ```tsx
 * const model = transformers.reranker('Xenova/ms-marco-MiniLM-L-6-v2');
 * const { data, isLoading, execute } = useRerank({ model, topK: 3 });
 * await execute({ query: 'What is machine learning?', documents });
 * // data.results — documents sorted by relevance score (highest first)
 * ```
 *
 * @see {@link https://localmode.dev/docs/core/reranking | core rerank()}
 */
export function useRerank(options: UseRerankOptions) {
  const { model, topK } = options;

  return useOperation<[RerankInput], RerankResult>({
    fn: async (input: RerankInput, signal: AbortSignal) => {
      const { rerank } = await import('@localmode/core');
      return rerank({
        model,
        query: input.query,
        documents: input.documents,
        // Per-call override wins over hook-level option
        topK: input.topK ?? topK,
        abortSignal: signal,
      });
    },
  });
}
