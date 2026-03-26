/**
 * Semantic Cache Module
 *
 * Embedding-based similarity cache for LLM responses.
 * Uses VectorDB internally for fast similarity search.
 *
 * @packageDocumentation
 */

export { createSemanticCache, semanticCacheMiddleware } from './semantic-cache.js';

export type {
  SemanticCacheConfig,
  SemanticCache,
  CacheLookupResult,
  CacheStats,
  CacheHitEvent,
  CacheMissEvent,
  CacheStoreEvent,
  CacheEvictEvent,
  CacheClearEvent,
} from './types.js';
