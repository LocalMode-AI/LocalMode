/**
 * Semantic Cache Types
 *
 * Types and interfaces for the embedding-based semantic cache.
 *
 * @packageDocumentation
 */

import type { EmbeddingModel } from '../embeddings/types.js';
import type { Storage } from '../storage/index.js';

// ═══════════════════════════════════════════════════════════════
// SEMANTIC CACHE CONFIG
// ═══════════════════════════════════════════════════════════════

/**
 * Configuration for creating a semantic cache.
 *
 * @example
 * ```ts
 * const config: SemanticCacheConfig = {
 *   embeddingModel: transformers.embedding('Xenova/bge-small-en-v1.5'),
 *   threshold: 0.92,
 *   maxEntries: 100,
 *   ttlMs: 3600000,
 * };
 * ```
 */
export interface SemanticCacheConfig {
  /** Embedding model used to generate prompt embeddings for similarity comparison */
  embeddingModel: EmbeddingModel;

  /** Cosine similarity threshold for cache hits (default: 0.92) */
  threshold?: number;

  /** Maximum number of cached entries before LRU eviction (default: 100) */
  maxEntries?: number;

  /** Time-to-live for cached entries in milliseconds (default: 3600000 / 1 hour) */
  ttlMs?: number;

  /**
   * Storage backend for the internal VectorDB.
   * - `'memory'` (default): In-memory storage, fastest, session-scoped
   * - `'indexeddb'`: Persistent storage, survives page reloads
   * - Custom `Storage` adapter: Your own storage implementation
   */
  storage?: 'memory' | 'indexeddb' | Storage;

  /** Whether to normalize prompts before embedding (default: true) */
  normalize?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// CACHE LOOKUP RESULT
// ═══════════════════════════════════════════════════════════════

/**
 * Result from a semantic cache lookup.
 */
export interface CacheLookupResult {
  /** Whether a cache hit occurred */
  hit: boolean;

  /** The cached response text (only on hit) */
  response?: string;

  /** Similarity score between the query and cached prompt (only on hit) */
  score?: number;

  /** ID of the matched cache entry (only on hit) */
  entryId?: string;

  /** Time spent on the lookup in milliseconds */
  durationMs: number;
}

// ═══════════════════════════════════════════════════════════════
// CACHE STATS
// ═══════════════════════════════════════════════════════════════

/**
 * Statistics about the semantic cache.
 */
export interface CacheStats {
  /** Number of cached entries */
  entries: number;

  /** Total cache hits since creation */
  hits: number;

  /** Total cache misses since creation */
  misses: number;

  /** Hit rate (hits / (hits + misses)), 0 if no lookups */
  hitRate: number;

  /** Timestamp of the oldest entry (null if empty) */
  oldestEntryMs: number | null;

  /** Timestamp of the newest entry (null if empty) */
  newestEntryMs: number | null;
}

// ═══════════════════════════════════════════════════════════════
// SEMANTIC CACHE INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Semantic cache instance for caching LLM responses based on prompt similarity.
 *
 * Created by {@link createSemanticCache}. Uses an internal VectorDB with HNSW index
 * to find semantically similar prompts and return cached responses.
 *
 * @example
 * ```ts
 * const cache = await createSemanticCache({
 *   embeddingModel: transformers.embedding('Xenova/bge-small-en-v1.5'),
 * });
 *
 * // Store a response
 * await cache.store({ prompt: 'What is AI?', response: 'AI is...', modelId: 'llama' });
 *
 * // Lookup similar prompt
 * const result = await cache.lookup({ prompt: 'Explain AI', modelId: 'llama' });
 * if (result.hit) {
 *   console.log(result.response); // 'AI is...'
 * }
 * ```
 */
export interface SemanticCache {
  /**
   * Look up a cached response for a semantically similar prompt.
   *
   * @param options - Lookup options
   * @returns Cache lookup result with hit/miss status
   */
  lookup(options: {
    prompt: string;
    modelId: string;
    abortSignal?: AbortSignal;
  }): Promise<CacheLookupResult>;

  /**
   * Store a prompt-response pair in the cache.
   *
   * @param options - Store options
   * @returns The entry ID of the stored pair
   */
  store(options: {
    prompt: string;
    response: string;
    modelId: string;
    abortSignal?: AbortSignal;
  }): Promise<{ entryId: string }>;

  /**
   * Clear cached entries, optionally filtered by modelId.
   *
   * @param filter - Optional filter to clear only entries for a specific model
   * @returns Number of entries removed
   */
  clear(filter?: { modelId?: string }): Promise<{ entriesRemoved: number }>;

  /**
   * Get cache statistics.
   *
   * @returns Current cache stats
   */
  stats(): CacheStats;

  /**
   * Destroy the cache and release all resources.
   * After calling destroy, all other methods will throw.
   */
  destroy(): Promise<void>;
}

// ═══════════════════════════════════════════════════════════════
// CACHE EVENT TYPES
// ═══════════════════════════════════════════════════════════════

/** Event data emitted on cache hit */
export interface CacheHitEvent {
  /** The prompt that was looked up */
  prompt: string;

  /** Similarity score */
  score: number;

  /** Model ID */
  modelId: string;

  /** Matched entry ID */
  entryId: string;
}

/** Event data emitted on cache miss */
export interface CacheMissEvent {
  /** The prompt that was looked up */
  prompt: string;

  /** Model ID */
  modelId: string;
}

/** Event data emitted when an entry is stored */
export interface CacheStoreEvent {
  /** The prompt that was stored */
  prompt: string;

  /** Model ID */
  modelId: string;

  /** New entry ID */
  entryId: string;
}

/** Event data emitted when an entry is evicted */
export interface CacheEvictEvent {
  /** Evicted entry ID */
  entryId: string;

  /** Reason for eviction */
  reason: 'lru' | 'ttl' | 'manual';
}

/** Event data emitted when cache is cleared */
export interface CacheClearEvent {
  /** Number of entries removed */
  entriesRemoved: number;
}
