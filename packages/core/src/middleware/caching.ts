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
 *
 * Uses every component of the query and every option that affects the result,
 * so two different searches never share an entry.
 */
function createSearchCacheKey(query: Float32Array, options: SearchOptions): string {
  const k = options.k ?? 10;
  const filter = options.filter ? JSON.stringify(options.filter) : '';
  const threshold = options.threshold ?? '';
  const includeVectors = options.includeVectors ? 1 : 0;
  return `search:${k}:${threshold}:${includeVectors}:${filter}:${Array.from(query).join(',')}`;
}

/**
 * Shallow-copy search results so callers and later middleware cannot mutate
 * cached entries.
 */
function copyResults(results: SearchResult[]): SearchResult[] {
  return results.map((result) => ({ ...result }));
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
 *     maxEmbeddings: 1000, // documents (with their vectors) kept for get()
 *     ttlMs: 60000, // 1 minute
 *   }),
 * });
 * ```
 */
export function cachingMiddleware(options: CachingMiddlewareOptions = {}): VectorDBMiddleware {
  const {
    maxSearchResults = 100,
    ttlMs = 60000,
    maxEmbeddings = 1000,
    cacheSearchResults = true,
    cacheDocuments = true,
  } = options;

  const searchCache = new LRUCache<string, SearchResult[]>(maxSearchResults, ttlMs);
  const documentCache = new LRUCache<string, Document>(maxEmbeddings, ttlMs);

  const invalidateAll = (): void => {
    searchCache.clear();
    documentCache.clear();
  };

  const invalidateDocument = (id: string): void => {
    // Any change can alter search results, so the search cache always goes.
    searchCache.clear();
    documentCache.delete(id);
  };

  return {
    // Answer repeated searches from the cache
    wrapSearch: async ({ doSearch, query, options: searchOptions }) => {
      if (!cacheSearchResults) {
        return doSearch();
      }

      const key = createSearchCacheKey(query, searchOptions);
      const cached = searchCache.get(key);
      if (cached) {
        return copyResults(cached);
      }

      const results = await doSearch();
      searchCache.set(key, copyResults(results));
      return results;
    },

    // Answer repeated gets from the cache
    wrapGet: async ({ doGet, id }) => {
      if (!cacheDocuments) {
        return doGet();
      }

      const cached = documentCache.get(id);
      if (cached) {
        return { ...cached };
      }

      const doc = await doGet();
      if (doc) {
        documentCache.set(id, { ...doc });
      }
      return doc;
    },

    afterAdd: async (doc: Document) => invalidateDocument(doc.id),
    afterUpdate: async (id: string) => invalidateDocument(id),
    afterDelete: async (id: string) => invalidateDocument(id),
    afterDeleteWhere: async () => invalidateAll(),
    afterImport: async () => invalidateAll(),
    afterClear: async () => invalidateAll(),
  };
}

/**
 * Alias for cachingMiddleware.
 */
export const createCachingMiddleware = cachingMiddleware;

