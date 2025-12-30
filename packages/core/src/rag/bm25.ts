/**
 * BM25 (Best Matching 25) implementation for keyword-based search.
 *
 * BM25 is a probabilistic ranking function used to estimate the relevance
 * of documents to a given search query. It's commonly used alongside
 * vector search in hybrid retrieval systems.
 *
 * @packageDocumentation
 */

import type { BM25Options, BM25Document, BM25Result, BM25Index, BM25IndexState } from './types.js';
import { DEFAULT_BM25_OPTIONS, ENGLISH_STOP_WORDS } from './types.js';

/**
 * Simple stemmer that reduces words to their base form.
 * This is a basic Porter-like stemmer for English.
 */
function simpleStem(word: string): string {
  let stem = word.toLowerCase();

  // Remove common suffixes
  const suffixes = [
    'ingly',
    'edly',
    'ness',
    'ment',
    'tion',
    'sion',
    'ious',
    'eous',
    'able',
    'ible',
    'less',
    'ful',
    'ing',
    'ied',
    'ies',
    'ily',
    'ers',
    'est',
    'ed',
    'er',
    'ly',
    's',
  ];

  for (const suffix of suffixes) {
    if (stem.length > suffix.length + 2 && stem.endsWith(suffix)) {
      stem = stem.slice(0, -suffix.length);
      break;
    }
  }

  return stem;
}

/**
 * Default tokenizer function.
 * Splits text into tokens, lowercases, and optionally stems.
 */
function defaultTokenize(
  text: string,
  options: { stemming?: boolean; minLength?: number } = {}
): string[] {
  const { stemming = false, minLength = 2 } = options;

  // Split on non-alphanumeric characters
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= minLength);

  if (stemming) {
    return tokens.map(simpleStem);
  }

  return tokens;
}

/**
 * BM25 search index implementation.
 *
 * @example
 * ```typescript
 * import { BM25 } from '@localmode/core';
 *
 * const bm25 = new BM25();
 *
 * // Add documents
 * bm25.add('doc1', 'The quick brown fox jumps over the lazy dog');
 * bm25.add('doc2', 'A lazy cat sleeps all day');
 *
 * // Search
 * const results = bm25.search('lazy animal', 5);
 * // Returns: [{ id: 'doc1', score: 0.85 }, { id: 'doc2', score: 0.72 }]
 * ```
 */
export class BM25 implements BM25Index {
  private k1: number;
  private b: number;
  private minTokenLength: number;
  private stopWords: Set<string>;
  private tokenize: (text: string) => string[];
  private stemming: boolean;

  private documents: Map<string, BM25Document> = new Map();
  private docFreqs: Map<string, number> = new Map();
  private avgDocLength = 0;
  private totalDocLength = 0;

  /**
   * Create a new BM25 index.
   *
   * @param options - BM25 configuration options
   */
  constructor(options: BM25Options = {}) {
    this.k1 = options.k1 ?? DEFAULT_BM25_OPTIONS.k1;
    this.b = options.b ?? DEFAULT_BM25_OPTIONS.b;
    this.minTokenLength = options.minTokenLength ?? DEFAULT_BM25_OPTIONS.minTokenLength;
    this.stemming = options.stemming ?? DEFAULT_BM25_OPTIONS.stemming;

    // Handle stop words
    if (options.stopWords) {
      this.stopWords =
        options.stopWords instanceof Set ? options.stopWords : new Set(options.stopWords);
    } else {
      this.stopWords = ENGLISH_STOP_WORDS;
    }

    // Set up tokenizer
    if (options.tokenize) {
      this.tokenize = options.tokenize;
    } else {
      this.tokenize = (text: string) =>
        defaultTokenize(text, {
          stemming: this.stemming,
          minLength: this.minTokenLength,
        }).filter((token) => !this.stopWords.has(token));
    }
  }

  /**
   * Add a document to the index.
   *
   * @param id - Document ID
   * @param text - Document text content
   */
  add(id: string, text: string): void {
    // Remove if exists (for updates)
    if (this.documents.has(id)) {
      this.remove(id);
    }

    const tokens = this.tokenize(text);
    const termFreqs = new Map<string, number>();

    // Calculate term frequencies
    for (const token of tokens) {
      termFreqs.set(token, (termFreqs.get(token) || 0) + 1);
    }

    // Update document frequencies
    for (const term of termFreqs.keys()) {
      this.docFreqs.set(term, (this.docFreqs.get(term) || 0) + 1);
    }

    // Store document
    this.documents.set(id, {
      id,
      tokens,
      termFreqs,
      length: tokens.length,
      text,
    });

    // Update average document length
    this.totalDocLength += tokens.length;
    this.avgDocLength = this.totalDocLength / this.documents.size;
  }

  /**
   * Add multiple documents to the index.
   *
   * @param documents - Array of { id, text } objects
   */
  addMany(documents: Array<{ id: string; text: string }>): void {
    for (const doc of documents) {
      this.add(doc.id, doc.text);
    }
  }

  /**
   * Search the index for documents matching the query.
   *
   * @param query - Search query text
   * @param k - Number of results to return (default: 10)
   * @returns Sorted array of results with scores
   */
  search(query: string, k = 10): BM25Result[] {
    const queryTokens = this.tokenize(query);

    if (queryTokens.length === 0 || this.documents.size === 0) {
      return [];
    }

    const scores: Array<{ id: string; score: number; text?: string }> = [];
    const N = this.documents.size;

    for (const doc of this.documents.values()) {
      let score = 0;

      for (const term of queryTokens) {
        const tf = doc.termFreqs.get(term) || 0;
        if (tf === 0) continue;

        const df = this.docFreqs.get(term) || 0;
        const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (doc.length / this.avgDocLength));

        score += idf * (numerator / denominator);
      }

      if (score > 0) {
        scores.push({ id: doc.id, score, text: doc.text });
      }
    }

    // Sort by score descending and return top k
    return scores.sort((a, b) => b.score - a.score).slice(0, k);
  }

  /**
   * Remove a document from the index.
   *
   * @param id - Document ID to remove
   */
  remove(id: string): void {
    const doc = this.documents.get(id);
    if (!doc) return;

    // Update document frequencies
    for (const term of doc.termFreqs.keys()) {
      const df = this.docFreqs.get(term) || 1;
      if (df <= 1) {
        this.docFreqs.delete(term);
      } else {
        this.docFreqs.set(term, df - 1);
      }
    }

    // Update average document length
    this.totalDocLength -= doc.length;
    this.documents.delete(id);
    this.avgDocLength = this.documents.size > 0 ? this.totalDocLength / this.documents.size : 0;
  }

  /**
   * Clear all documents from the index.
   */
  clear(): void {
    this.documents.clear();
    this.docFreqs.clear();
    this.avgDocLength = 0;
    this.totalDocLength = 0;
  }

  /**
   * Get index statistics.
   *
   * @returns Object with docCount, avgDocLength, and vocabularySize
   */
  stats(): { docCount: number; avgDocLength: number; vocabularySize: number } {
    return {
      docCount: this.documents.size,
      avgDocLength: this.avgDocLength,
      vocabularySize: this.docFreqs.size,
    };
  }

  /**
   * Serialize the index to JSON for persistence.
   *
   * @returns Serializable index state
   */
  toJSON(): BM25IndexState {
    const documents: BM25IndexState['documents'] = [];

    for (const doc of this.documents.values()) {
      documents.push({
        id: doc.id,
        tokens: doc.tokens,
        length: doc.length,
        text: doc.text,
      });
    }

    return {
      docCount: this.documents.size,
      avgDocLength: this.avgDocLength,
      docFreqs: Object.fromEntries(this.docFreqs),
      documents,
    };
  }

  /**
   * Load index from serialized state.
   *
   * @param state - Previously serialized index state
   */
  fromJSON(state: BM25IndexState): void {
    this.clear();

    this.avgDocLength = state.avgDocLength;
    this.docFreqs = new Map(Object.entries(state.docFreqs));

    for (const doc of state.documents) {
      // Rebuild term frequencies from tokens
      const termFreqs = new Map<string, number>();
      for (const token of doc.tokens) {
        termFreqs.set(token, (termFreqs.get(token) || 0) + 1);
      }

      this.documents.set(doc.id, {
        id: doc.id,
        tokens: doc.tokens,
        termFreqs,
        length: doc.length,
        text: doc.text,
      });

      this.totalDocLength += doc.length;
    }
  }

  /**
   * Check if a document exists in the index.
   *
   * @param id - Document ID
   * @returns true if document exists
   */
  has(id: string): boolean {
    return this.documents.has(id);
  }

  /**
   * Get document count.
   *
   * @returns Number of indexed documents
   */
  get size(): number {
    return this.documents.size;
  }
}

/**
 * Create a new BM25 index with the given options.
 *
 * @param options - BM25 configuration
 * @returns New BM25 index instance
 *
 * @example
 * ```typescript
 * import { createBM25 } from '@localmode/core';
 *
 * const bm25 = createBM25({
 *   k1: 1.5,
 *   b: 0.75,
 *   stemming: true,
 * });
 * ```
 */
export function createBM25(options: BM25Options = {}): BM25 {
  return new BM25(options);
}

/**
 * Create a BM25 index from an array of documents.
 *
 * @param documents - Documents to index
 * @param options - BM25 configuration
 * @returns Populated BM25 index
 *
 * @example
 * ```typescript
 * import { createBM25FromDocuments } from '@localmode/core';
 *
 * const bm25 = createBM25FromDocuments([
 *   { id: 'doc1', text: 'The quick brown fox' },
 *   { id: 'doc2', text: 'A lazy dog sleeps' },
 * ]);
 *
 * const results = bm25.search('fox');
 * ```
 */
export function createBM25FromDocuments(
  documents: Array<{ id: string; text: string }>,
  options: BM25Options = {}
): BM25 {
  const bm25 = new BM25(options);
  bm25.addMany(documents);
  return bm25;
}

