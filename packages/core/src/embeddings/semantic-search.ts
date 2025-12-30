/**
 * Semantic Search Function
 *
 * Combines embedding generation with vector database search.
 *
 * @packageDocumentation
 */

import { embed } from './embed.js';
import type {
  SemanticSearchOptions,
  SemanticSearchResult,
  SemanticSearchResultItem,
} from './types.js';

/**
 * Perform semantic search by embedding the query and searching the vector database.
 *
 * This is a convenience function that combines embed() and db.search().
 *
 * @param options - Semantic search options
 * @returns Promise with search results and usage information
 *
 * @example
 * ```ts
 * import { semanticSearch, createVectorDB } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const db = await createVectorDB({ name: 'docs', dimensions: 384 });
 * const model = transformers.embedding('Xenova/all-MiniLM-L6-v2');
 *
 * const { results, usage } = await semanticSearch({
 *   db,
 *   model,
 *   query: 'How to configure authentication?',
 *   k: 5,
 * });
 *
 * for (const result of results) {
 *   console.log(`${result.id}: ${result.score.toFixed(3)} - ${result.text}`);
 * }
 * ```
 *
 * @example With filter
 * ```ts
 * const { results } = await semanticSearch({
 *   db,
 *   model,
 *   query: 'authentication',
 *   k: 10,
 *   filter: { category: 'security' },
 * });
 * ```
 *
 * @see {@link embed} for embedding only
 */
export async function semanticSearch(
  options: SemanticSearchOptions
): Promise<SemanticSearchResult> {
  const {
    db,
    model,
    query,
    k = 10,
    filter,
    threshold,
    abortSignal,
    headers,
    providerOptions,
  } = options;

  // Check for cancellation before starting
  abortSignal?.throwIfAborted();

  // Embed the query
  const embedStartTime = performance.now();
  const { embedding, usage: embedUsage } = await embed({
    model,
    value: query,
    abortSignal,
    headers,
    providerOptions,
  });
  const embedDurationMs = performance.now() - embedStartTime;

  // Search the database
  const searchStartTime = performance.now();
  const dbResults = await db.search(embedding, {
    k,
    filter,
    threshold,
  });
  const searchDurationMs = performance.now() - searchStartTime;

  // Transform results
  const results: SemanticSearchResultItem[] = dbResults.map((r) => ({
    id: r.id,
    score: r.score,
    text: extractText(r.metadata),
    metadata: r.metadata,
  }));

  return {
    results,
    usage: {
      embeddingTokens: embedUsage.tokens,
      embedDurationMs,
      searchDurationMs,
    },
  };
}

/**
 * Extract text from metadata if available.
 * Looks for common text field names.
 */
function extractText(metadata?: Record<string, unknown>): string | undefined {
  if (!metadata) return undefined;

  // Common text field names
  const textFields = ['text', 'content', 'body', '__text', 'pageContent'];

  for (const field of textFields) {
    const value = metadata[field];
    if (typeof value === 'string') {
      return value;
    }
  }

  return undefined;
}

/**
 * Stream semantic search results for large queries or real-time updates.
 *
 * @param options - Semantic search options
 * @yields Search results as they become available
 *
 * @example
 * ```ts
 * for await (const result of streamSemanticSearch({
 *   db,
 *   model,
 *   query: 'authentication',
 *   k: 100,
 * })) {
 *   console.log(result.id, result.score);
 * }
 * ```
 */
export async function* streamSemanticSearch(
  options: SemanticSearchOptions
): AsyncGenerator<SemanticSearchResultItem> {
  // For now, this is a simple implementation that yields all results
  // In the future, this could be enhanced to stream from the database
  const { results } = await semanticSearch(options);

  for (const result of results) {
    yield result;
  }
}
