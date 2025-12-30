/**
 * Reranking Functions
 *
 * Core rerank() function for reordering documents by relevance.
 * This function accepts RerankerModel interface - implementations come from provider packages.
 *
 * @packageDocumentation
 */

import type { RerankerModel, RerankOptions, RerankResult } from './types.js';

// Global provider registry for string model ID resolution
let globalRerankerRegistry: GlobalRerankerRegistry | null = null;

interface GlobalRerankerRegistry {
  resolve(id: string): RerankerModel;
}

/**
 * Set the global reranker provider registry for string model ID resolution.
 * Call this once at app initialization.
 *
 * @example
 * ```ts
 * import { setGlobalRerankerProvider } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * setGlobalRerankerProvider({
 *   transformers,
 * });
 *
 * // Now string model IDs work
 * const { results } = await rerank({
 *   model: 'transformers:Xenova/ms-marco-MiniLM-L-6-v2',
 *   query: 'What is machine learning?',
 *   documents: ['ML is...', 'Cooking...'],
 * });
 * ```
 */
export function setGlobalRerankerProvider(
  providers: Record<string, { reranker: (modelId: string) => RerankerModel }>,
  options?: { separator?: string }
): void {
  const separator = options?.separator ?? ':';

  globalRerankerRegistry = {
    resolve(id: string): RerankerModel {
      const sepIndex = id.indexOf(separator);
      if (sepIndex === -1) {
        throw new Error(
          `Invalid model ID format: "${id}". Expected "provider${separator}modelId" format.`
        );
      }

      const providerName = id.slice(0, sepIndex);
      const modelId = id.slice(sepIndex + 1);

      const provider = providers[providerName];
      if (!provider) {
        throw new Error(
          `Unknown provider: "${providerName}". Available providers: ${Object.keys(providers).join(', ')}`
        );
      }

      return provider.reranker(modelId);
    },
  };
}

/**
 * Resolve a reranker model from string ID or return the model object as-is.
 */
function resolveRerankerModel(modelOrId: RerankerModel | string): RerankerModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalRerankerRegistry) {
    throw new Error(
      'No global provider configured. Call setGlobalRerankerProvider() first, or pass a model object instead of a string.'
    );
  }

  return globalRerankerRegistry.resolve(modelOrId);
}

/**
 * Rerank documents by relevance to a query.
 *
 * Reranking is a crucial step in RAG (Retrieval-Augmented Generation) pipelines.
 * After initial retrieval (e.g., via vector search), reranking improves result
 * quality by scoring document-query pairs more precisely.
 *
 * This function is in @localmode/core - model implementations are in provider packages.
 *
 * @param options - Reranking options
 * @returns Promise with ranked results, usage, and response information
 *
 * @example Basic usage
 * ```ts
 * import { rerank } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { results } = await rerank({
 *   model: transformers.reranker('Xenova/ms-marco-MiniLM-L-6-v2'),
 *   query: 'What is machine learning?',
 *   documents: [
 *     'Machine learning is a type of artificial intelligence...',
 *     'Cooking pasta requires boiling water...',
 *     'Deep learning is a subset of machine learning...',
 *   ],
 *   topK: 2,
 * });
 *
 * // results: [
 * //   { index: 0, score: 0.95, text: 'Machine learning is a type of...' },
 * //   { index: 2, score: 0.88, text: 'Deep learning is a subset of...' }
 * // ]
 * ```
 *
 * @example In a RAG pipeline
 * ```ts
 * // 1. Initial retrieval via vector search
 * const initialResults = await semanticSearch({
 *   db,
 *   model: embeddingModel,
 *   query: 'What is machine learning?',
 *   k: 20, // Get more candidates
 * });
 *
 * // 2. Rerank for better precision
 * const { results } = await rerank({
 *   model: transformers.reranker('Xenova/ms-marco-MiniLM-L-6-v2'),
 *   query: 'What is machine learning?',
 *   documents: initialResults.results.map(r => r.document.text),
 *   topK: 5, // Return top 5 after reranking
 * });
 * ```
 *
 * @example With string model ID (requires global provider setup)
 * ```ts
 * const { results } = await rerank({
 *   model: 'transformers:Xenova/ms-marco-MiniLM-L-6-v2',
 *   query: 'climate change effects',
 *   documents: documentTexts,
 * });
 * ```
 *
 * @throws {Error} If reranking fails after all retries
 * @throws {Error} If aborted via AbortSignal
 *
 * @see {@link semanticSearch} for initial vector search
 * @see {@link hybridSearch} for hybrid search combining vector and keyword search
 */
export async function rerank(options: RerankOptions): Promise<RerankResult> {
  const {
    model: modelOrId,
    query,
    documents,
    topK,
    abortSignal,
    maxRetries = 2,
    headers,
    providerOptions,
  } = options;

  // Resolve string model ID to model object
  const model = resolveRerankerModel(modelOrId);

  // Check for cancellation before starting
  abortSignal?.throwIfAborted();

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check before each retry
    abortSignal?.throwIfAborted();

    try {
      const result = await model.doRerank({
        query,
        documents,
        topK,
        abortSignal,
        headers,
        providerOptions,
      });

      return {
        results: result.results,
        usage: result.usage,
        response: {
          modelId: model.modelId,
          timestamp: new Date(),
        },
      };
    } catch (error) {
      lastError = error as Error;

      // Don't retry if aborted
      if (abortSignal?.aborted) {
        throw new Error('Reranking was cancelled', { cause: lastError });
      }

      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }
    }
  }

  throw new Error(`Reranking failed after ${maxRetries + 1} attempts`, {
    cause: lastError,
  });
}
