/**
 * Hybrid search combining vector similarity and BM25 keyword search.
 *
 * Hybrid search leverages the strengths of both approaches:
 * - Vector search finds semantically similar content
 * - BM25 finds exact keyword matches and handles rare terms
 *
 * The results are combined using Reciprocal Rank Fusion (RRF)
 * or weighted score combination.
 *
 * @packageDocumentation
 */

import type { VectorDB, SearchResult } from '../types.js';
import type { HybridSearchOptions, HybridSearchResult, BM25Options } from './types.js';
import { DEFAULT_HYBRID_OPTIONS } from './types.js';
import { BM25 } from './bm25.js';

/**
 * Hybrid search manager that combines vector and keyword search.
 *
 * @example
 * ```typescript
 * import { HybridSearch } from '@localmode/core';
 *
 * const hybrid = new HybridSearch(vectorDb);
 *
 * // Add documents with text
 * await hybrid.add('doc1', 'The quick brown fox', embedding1);
 * await hybrid.add('doc2', 'A lazy dog sleeps', embedding2);
 *
 * // Hybrid search
 * const results = await hybrid.search(queryEmbedding, 'brown fox', { k: 10 });
 * ```
 */
export class HybridSearch {
  private db: VectorDB;
  private bm25: BM25;
  private textStore: Map<string, string> = new Map();

  /**
   * Create a new hybrid search instance.
   *
   * @param db - Vector database instance
   * @param bm25Options - BM25 configuration options
   */
  constructor(db: VectorDB, bm25Options: BM25Options = {}) {
    this.db = db;
    this.bm25 = new BM25(bm25Options);
  }

  /**
   * Add a document with both vector and text for hybrid search.
   *
   * @param id - Document ID
   * @param text - Document text content
   * @param vector - Document embedding vector
   * @param metadata - Optional metadata
   */
  async add(
    id: string,
    text: string,
    vector: Float32Array,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    // Add to vector DB
    await this.db.add({ id, vector, metadata: { ...metadata, _text: text } });

    // Add to BM25 index
    this.bm25.add(id, text);
    this.textStore.set(id, text);
  }

  /**
   * Add multiple documents for hybrid search.
   *
   * @param documents - Array of documents with id, text, vector, and optional metadata
   */
  async addMany(
    documents: Array<{
      id: string;
      text: string;
      vector: Float32Array;
      metadata?: Record<string, unknown>;
    }>
  ): Promise<void> {
    // Add to vector DB
    await this.db.addMany(
      documents.map((doc) => ({
        id: doc.id,
        vector: doc.vector,
        metadata: { ...doc.metadata, _text: doc.text },
      }))
    );

    // Add to BM25 index
    for (const doc of documents) {
      this.bm25.add(doc.id, doc.text);
      this.textStore.set(doc.id, doc.text);
    }
  }

  /**
   * Perform hybrid search combining vector and keyword search.
   *
   * @param queryVector - Query embedding vector
   * @param queryText - Query text for keyword search
   * @param options - Search configuration
   * @returns Combined and ranked results
   */
  async search(
    queryVector: Float32Array,
    queryText: string,
    options: HybridSearchOptions = {}
  ): Promise<HybridSearchResult[]> {
    const {
      k = DEFAULT_HYBRID_OPTIONS.k,
      vectorWeight = DEFAULT_HYBRID_OPTIONS.vectorWeight,
      keywordWeight = DEFAULT_HYBRID_OPTIONS.keywordWeight,
      normalizeScores = DEFAULT_HYBRID_OPTIONS.normalizeScores,
      threshold = DEFAULT_HYBRID_OPTIONS.threshold,
      filter,
      includeVectors = DEFAULT_HYBRID_OPTIONS.includeVectors,
      fetchK = k * 3,
    } = options;

    // Perform both searches in parallel
    const [vectorResults, bm25Results] = await Promise.all([
      this.db.search(queryVector, { k: fetchK, filter, includeVectors }),
      Promise.resolve(this.bm25.search(queryText, fetchK)),
    ]);

    // Combine results using score fusion
    const combined = fuseResults(vectorResults, bm25Results, {
      vectorWeight,
      keywordWeight,
      normalizeScores,
    });

    // Apply threshold and limit
    const filtered = combined.filter((r) => r.score >= threshold).slice(0, k);

    // Add text content to results
    return filtered.map((result) => ({
      ...result,
      text: this.textStore.get(result.id),
    }));
  }

  /**
   * Remove a document from the hybrid index.
   *
   * @param id - Document ID to remove
   */
  async remove(id: string): Promise<void> {
    await this.db.delete(id);
    this.bm25.remove(id);
    this.textStore.delete(id);
  }

  /**
   * Clear all documents from the hybrid index.
   */
  async clear(): Promise<void> {
    await this.db.clear();
    this.bm25.clear();
    this.textStore.clear();
  }

  /**
   * Get the underlying BM25 index for advanced operations.
   */
  getBM25Index(): BM25 {
    return this.bm25;
  }

  /**
   * Get the underlying vector database.
   */
  getVectorDB(): VectorDB {
    return this.db;
  }

  /**
   * Export the BM25 index state for persistence.
   */
  exportBM25State(): ReturnType<BM25['toJSON']> {
    return this.bm25.toJSON();
  }

  /**
   * Import BM25 index state.
   */
  importBM25State(state: ReturnType<BM25['toJSON']>): void {
    this.bm25.fromJSON(state);

    // Rebuild text store from BM25 documents
    for (const doc of state.documents) {
      if (doc.text) {
        this.textStore.set(doc.id, doc.text);
      }
    }
  }
}

/**
 * Fuse vector and keyword search results using weighted combination.
 */
function fuseResults(
  vectorResults: SearchResult[],
  bm25Results: Array<{ id: string; score: number }>,
  options: {
    vectorWeight: number;
    keywordWeight: number;
    normalizeScores: boolean;
  }
): HybridSearchResult[] {
  const { vectorWeight, keywordWeight, normalizeScores } = options;

  // Create score maps
  const vectorScores = new Map<string, number>();
  const keywordScores = new Map<string, number>();
  const metadataMap = new Map<string, Record<string, unknown> | undefined>();
  const vectorMap = new Map<string, Float32Array | undefined>();

  // Collect vector scores
  for (const result of vectorResults) {
    vectorScores.set(result.id, result.score);
    metadataMap.set(result.id, result.metadata);
    vectorMap.set(result.id, result.vector);
  }

  // Collect keyword scores
  for (const result of bm25Results) {
    keywordScores.set(result.id, result.score);
  }

  // Get all unique IDs
  const allIds = new Set([...vectorScores.keys(), ...keywordScores.keys()]);

  // Normalize scores if requested
  let normalizedVectorScores = vectorScores;
  let normalizedKeywordScores = keywordScores;

  if (normalizeScores) {
    normalizedVectorScores = normalizeScoreMap(vectorScores);
    normalizedKeywordScores = normalizeScoreMap(keywordScores);
  }

  // Combine scores
  const results: HybridSearchResult[] = [];

  for (const id of allIds) {
    const vScore = normalizedVectorScores.get(id) || 0;
    const kScore = normalizedKeywordScores.get(id) || 0;

    const combinedScore = vScore * vectorWeight + kScore * keywordWeight;

    results.push({
      id,
      score: combinedScore,
      vectorScore: vectorScores.get(id),
      keywordScore: keywordScores.get(id),
      metadata: metadataMap.get(id),
      vector: vectorMap.get(id),
    });
  }

  // Sort by combined score
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Normalize scores to [0, 1] range.
 */
function normalizeScoreMap(scores: Map<string, number>): Map<string, number> {
  if (scores.size === 0) return scores;

  const values = Array.from(scores.values());
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  if (range === 0) {
    // All scores are the same
    return new Map(Array.from(scores.entries()).map(([id]) => [id, 1]));
  }

  return new Map(Array.from(scores.entries()).map(([id, score]) => [id, (score - min) / range]));
}

/**
 * Perform hybrid search using Reciprocal Rank Fusion (RRF).
 *
 * RRF combines rankings rather than scores, which can be more robust
 * when the score distributions differ significantly.
 *
 * @param vectorResults - Results from vector search
 * @param bm25Results - Results from BM25 search
 * @param k - Constant for RRF (default: 60)
 * @returns Fused results sorted by RRF score
 *
 * @example
 * ```typescript
 * import { reciprocalRankFusion } from '@localmode/core';
 *
 * const vectorResults = await db.search(queryVector, { k: 20 });
 * const bm25Results = bm25.search(queryText, 20);
 *
 * const fused = reciprocalRankFusion(vectorResults, bm25Results);
 * ```
 */
export function reciprocalRankFusion(
  vectorResults: SearchResult[],
  bm25Results: Array<{ id: string; score: number }>,
  k = 60
): HybridSearchResult[] {
  const rrfScores = new Map<string, number>();
  const metadataMap = new Map<string, Record<string, unknown> | undefined>();
  const vectorScoreMap = new Map<string, number>();
  const keywordScoreMap = new Map<string, number>();

  // Add RRF scores from vector results
  for (let i = 0; i < vectorResults.length; i++) {
    const result = vectorResults[i];
    const rank = i + 1;
    rrfScores.set(result.id, (rrfScores.get(result.id) || 0) + 1 / (k + rank));
    metadataMap.set(result.id, result.metadata);
    vectorScoreMap.set(result.id, result.score);
  }

  // Add RRF scores from BM25 results
  for (let i = 0; i < bm25Results.length; i++) {
    const result = bm25Results[i];
    const rank = i + 1;
    rrfScores.set(result.id, (rrfScores.get(result.id) || 0) + 1 / (k + rank));
    keywordScoreMap.set(result.id, result.score);
  }

  // Build results
  const results: HybridSearchResult[] = Array.from(rrfScores.entries()).map(([id, score]) => ({
    id,
    score,
    vectorScore: vectorScoreMap.get(id),
    keywordScore: keywordScoreMap.get(id),
    metadata: metadataMap.get(id),
  }));

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Create a hybrid search instance from a vector database.
 *
 * @param db - Vector database instance
 * @param bm25Options - BM25 configuration
 * @returns Hybrid search instance
 *
 * @example
 * ```typescript
 * import { createHybridSearch, createVectorDB } from '@localmode/core';
 *
 * const db = await createVectorDB({ name: 'docs', dimensions: 384 });
 * const hybrid = createHybridSearch(db);
 *
 * await hybrid.add('doc1', 'The quick brown fox', embedding);
 * ```
 */
export function createHybridSearch(db: VectorDB, bm25Options: BM25Options = {}): HybridSearch {
  return new HybridSearch(db, bm25Options);
}

/**
 * Perform a one-off hybrid search without maintaining state.
 *
 * This function is useful when you already have separate vector and BM25 results
 * and just want to combine them.
 *
 * @param vectorResults - Results from vector search
 * @param bm25Results - Results from BM25 search
 * @param options - Fusion options
 * @returns Combined results
 *
 * @example
 * ```typescript
 * import { hybridFuse } from '@localmode/core';
 *
 * const vectorResults = await db.search(queryVector, { k: 20 });
 * const bm25Results = bm25.search(queryText, 20);
 *
 * const combined = hybridFuse(vectorResults, bm25Results, {
 *   vectorWeight: 0.7,
 *   keywordWeight: 0.3,
 * });
 * ```
 */
export function hybridFuse(
  vectorResults: SearchResult[],
  bm25Results: Array<{ id: string; score: number }>,
  options: {
    vectorWeight?: number;
    keywordWeight?: number;
    normalizeScores?: boolean;
    useRRF?: boolean;
    rrfK?: number;
  } = {}
): HybridSearchResult[] {
  const {
    vectorWeight = DEFAULT_HYBRID_OPTIONS.vectorWeight,
    keywordWeight = DEFAULT_HYBRID_OPTIONS.keywordWeight,
    normalizeScores = DEFAULT_HYBRID_OPTIONS.normalizeScores,
    useRRF = false,
    rrfK = 60,
  } = options;

  if (useRRF) {
    return reciprocalRankFusion(vectorResults, bm25Results, rrfK);
  }

  return fuseResults(vectorResults, bm25Results, {
    vectorWeight,
    keywordWeight,
    normalizeScores,
  });
}

