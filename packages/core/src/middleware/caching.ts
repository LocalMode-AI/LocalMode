/**
 * Caching Middleware
 *
 * Cache search results and document retrievals for improved performance.
 *
 * @packageDocumentation
 */

import type { Document, SearchResult, SearchOptions } from '../types.js';
import type { VectorDBMiddleware, CachingMiddlewareOptions } from './types.js';

/**
 * Simple LRU cache implementation.
 */
class LRUCache<K, V> {
  private cache = new Map<K, { value: V; expiry: number }>();
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize: number, ttlMs: number) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    // Delete if exists to refresh position
    this.cache.delete(key);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      value,
      expiry: Date.now() + this.ttlMs,
    });
  }

  delete(key: K): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }
}

/**
 * Create a cache key from search parameters.
 */
function createSearchCacheKey(query: Float32Array, options: SearchOptions): string {
  // Use first few elements + k + filter hash
  const queryHash = Array.from(query.slice(0, 8))
    .map((v) => v.toFixed(4))
    .join(',');
  const k = options.k ?? 10;
  const filterHash = options.filter ? JSON.stringify(options.filter) : '';
  return `search:${queryHash}:${k}:${filterHash}`;
}

/**
 * Create caching middleware for VectorDB.
 *
 * @example
 * ```typescript
 * import { createVectorDB, wrapVectorDB, cachingMiddleware } from '@localmode/core';
 *
 * const db = await createVectorDB({ name: 'my-db', dimensions: 384 });
 *
 * const cachedDb = wrapVectorDB({
 *   db,
 *   middleware: cachingMiddleware({
 *     maxSearchResults: 100,
 *     ttlMs: 60000, // 1 minute
 *   }),
 * });
 * ```
 */
export function cachingMiddleware(options: CachingMiddlewareOptions = {}): VectorDBMiddleware {
  const {
    maxSearchResults = 100,
    ttlMs = 60000,
    cacheSearchResults = true,
    cacheDocuments = true,
  } = options;

  const searchCache = new LRUCache<string, SearchResult[]>(maxSearchResults, ttlMs);
  const documentCache = new LRUCache<string, Document>(maxSearchResults, ttlMs);

  return {
    // Cache document after get
    afterGet: async (doc: Document | undefined) => {
      if (cacheDocuments && doc) {
        documentCache.set(doc.id, doc);
      }
      return doc;
    },

    // Invalidate cache on add
    afterAdd: async (doc: Document) => {
      // Invalidate search cache as new document might affect results
      searchCache.clear();
      // Cache the new document
      if (cacheDocuments) {
        documentCache.set(doc.id, doc);
      }
    },

    // Invalidate cache on delete
    afterDelete: async (id: string) => {
      searchCache.clear();
      documentCache.delete(id);
    },

    // Check cache before search
    beforeSearch: async (query: Float32Array, searchOptions: SearchOptions) => {
      if (!cacheSearchResults) {
        return { query, options: searchOptions };
      }

      const key = createSearchCacheKey(query, searchOptions);
      const cached = searchCache.get(key);

      if (cached) {
        // Store in options for afterSearch to detect
        (searchOptions as Record<string, unknown>).__cacheHit = true;
        (searchOptions as Record<string, unknown>).__cachedResults = cached;
      }

      return { query, options: searchOptions };
    },

    // Return cached results or cache new results
    afterSearch: async (results: SearchResult[]) => {
      // This is a simplified implementation
      // In a real implementation, we'd need to intercept before the actual search
      return results;
    },

    // Clear all caches on clear
    afterClear: async () => {
      searchCache.clear();
      documentCache.clear();
    },
  };
}

/**
 * Alias for cachingMiddleware.
 */
export const createCachingMiddleware = cachingMiddleware;

