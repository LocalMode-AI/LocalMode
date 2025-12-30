/**
 * VectorDB Middleware Wrapper
 *
 * Wrap a VectorDB instance with middleware for extensibility.
 *
 * @packageDocumentation
 */

import type {
  VectorDB,
  Document,
  SearchOptions,
  SearchResult,
  FilterQuery,
  AddManyOptions,
  ExportOptions,
  ImportOptions,
  DBStats,
} from '../types.js';
import type { VectorDBMiddleware } from './types.js';

/**
 * Options for wrapping a VectorDB with middleware.
 */
export interface WrapVectorDBOptions {
  /** The VectorDB instance to wrap */
  db: VectorDB;

  /** Middleware to apply */
  middleware: VectorDBMiddleware | VectorDBMiddleware[];
}

/**
 * Compose multiple middleware into a single middleware.
 *
 * @example
 * ```typescript
 * import { composeVectorDBMiddleware, loggingMiddleware, cachingMiddleware } from '@localmode/core';
 *
 * const middleware = composeVectorDBMiddleware([
 *   loggingMiddleware({ level: 'info' }),
 *   cachingMiddleware({ ttlMs: 60000 }),
 * ]);
 * ```
 */
export function composeVectorDBMiddleware(
  middlewares: VectorDBMiddleware[]
): VectorDBMiddleware {
  return {
    beforeAdd: async (doc: Document) => {
      let result = doc;
      for (const mw of middlewares) {
        if (mw.beforeAdd) {
          result = await mw.beforeAdd(result);
        }
      }
      return result;
    },

    afterAdd: async (doc: Document) => {
      for (const mw of middlewares) {
        if (mw.afterAdd) {
          await mw.afterAdd(doc);
        }
      }
    },

    afterGet: async (doc: Document | undefined) => {
      let result = doc;
      for (const mw of middlewares) {
        if (mw.afterGet) {
          result = await mw.afterGet(result);
        }
      }
      return result;
    },

    beforeDelete: async (id: string) => {
      for (const mw of middlewares) {
        if (mw.beforeDelete) {
          const allowed = await mw.beforeDelete(id);
          if (!allowed) return false;
        }
      }
      return true;
    },

    afterDelete: async (id: string) => {
      for (const mw of middlewares) {
        if (mw.afterDelete) {
          await mw.afterDelete(id);
        }
      }
    },

    beforeSearch: async (query: Float32Array, options: SearchOptions) => {
      let q = query;
      let opts = options;
      for (const mw of middlewares) {
        if (mw.beforeSearch) {
          const result = await mw.beforeSearch(q, opts);
          q = result.query;
          opts = result.options;
        }
      }
      return { query: q, options: opts };
    },

    afterSearch: async (results: SearchResult[]) => {
      let r = results;
      for (const mw of middlewares) {
        if (mw.afterSearch) {
          r = await mw.afterSearch(r);
        }
      }
      return r;
    },

    beforeClear: async () => {
      for (const mw of middlewares) {
        if (mw.beforeClear) {
          const allowed = await mw.beforeClear();
          if (!allowed) return false;
        }
      }
      return true;
    },

    afterClear: async () => {
      for (const mw of middlewares) {
        if (mw.afterClear) {
          await mw.afterClear();
        }
      }
    },

    onError: async (error: Error, operation: string) => {
      for (const mw of middlewares) {
        if (mw.onError) {
          const suppress = await mw.onError(error, operation);
          if (suppress) return true;
        }
      }
      return false;
    },
  };
}

/**
 * Wrap a VectorDB with middleware.
 *
 * Creates a proxy that intercepts operations and applies middleware.
 *
 * @example
 * ```typescript
 * import { createVectorDB, wrapVectorDB } from '@localmode/core';
 *
 * const db = await createVectorDB({ name: 'my-db', dimensions: 384 });
 *
 * const wrappedDb = wrapVectorDB({
 *   db,
 *   middleware: {
 *     beforeAdd: (doc) => {
 *       console.log('Adding document:', doc.id);
 *       return doc;
 *     },
 *     afterSearch: (results) => {
 *       console.log('Found', results.length, 'results');
 *       return results;
 *     },
 *   },
 * });
 * ```
 */
export function wrapVectorDB(options: WrapVectorDBOptions): VectorDB {
  const { db } = options;
  const middleware = Array.isArray(options.middleware)
    ? composeVectorDBMiddleware(options.middleware)
    : options.middleware;

  // Helper to handle errors
  const handleError = async (error: Error, operation: string): Promise<never> => {
    if (middleware.onError) {
      await middleware.onError(error, operation);
    }
    throw error;
  };

  // Create wrapped DB object
  const wrapped: VectorDB = {
    // Wrap add with middleware
    async add(document: Document): Promise<void> {
      try {
        let doc = document;
        if (middleware.beforeAdd) {
          doc = await middleware.beforeAdd(doc);
        }
        await db.add(doc);
        if (middleware.afterAdd) {
          await middleware.afterAdd(doc);
        }
      } catch (error) {
        await handleError(error as Error, 'add');
      }
    },

    // Wrap addMany with middleware
    async addMany(documents: Document[], addOptions?: AddManyOptions): Promise<void> {
      try {
        let docs = documents;
        if (middleware.beforeAdd) {
          docs = [];
          for (const d of documents) {
            docs.push(await middleware.beforeAdd(d));
          }
        }
        await db.addMany(docs, addOptions);
        if (middleware.afterAdd) {
          for (const d of docs) {
            await middleware.afterAdd(d);
          }
        }
      } catch (error) {
        await handleError(error as Error, 'addMany');
      }
    },

    // Wrap get with middleware
    async get(id: string): Promise<(Document & { metadata?: Record<string, unknown> }) | null> {
      try {
        const result = await db.get(id);
        if (middleware.afterGet && result) {
          const processed = await middleware.afterGet(result as Document);
          return (processed as (Document & { metadata?: Record<string, unknown> })) ?? null;
        }
        return result;
      } catch (error) {
        return handleError(error as Error, 'get');
      }
    },

    // Wrap update (pass-through)
    async update(id: string, updates: Partial<Omit<Document, 'id'>>): Promise<void> {
      try {
        await db.update(id, updates);
      } catch (error) {
        await handleError(error as Error, 'update');
      }
    },

    // Wrap delete with middleware
    async delete(id: string): Promise<void> {
      try {
        if (middleware.beforeDelete) {
          const allowed = await middleware.beforeDelete(id);
          if (!allowed) return;
        }
        await db.delete(id);
        if (middleware.afterDelete) {
          await middleware.afterDelete(id);
        }
      } catch (error) {
        await handleError(error as Error, 'delete');
      }
    },

    // Wrap deleteMany (pass-through)
    async deleteMany(ids: string[]): Promise<void> {
      try {
        if (middleware.beforeDelete) {
          for (const id of ids) {
            const allowed = await middleware.beforeDelete(id);
            if (!allowed) {
              // Skip this id - for simplicity we process all or none
              return;
            }
          }
        }
        await db.deleteMany(ids);
        if (middleware.afterDelete) {
          for (const id of ids) {
            await middleware.afterDelete(id);
          }
        }
      } catch (error) {
        await handleError(error as Error, 'deleteMany');
      }
    },

    // Wrap deleteWhere (pass-through)
    async deleteWhere(filter: FilterQuery): Promise<number> {
      return db.deleteWhere(filter);
    },

    // Wrap search with middleware
    async search(query: Float32Array, searchOptions?: SearchOptions): Promise<SearchResult[]> {
      try {
        let q = query;
        let opts = searchOptions ?? {};

        if (middleware.beforeSearch) {
          const result = await middleware.beforeSearch(q, opts);
          q = result.query;
          opts = result.options;
        }

        let results = await db.search(q, opts);

        if (middleware.afterSearch) {
          results = await middleware.afterSearch(results);
        }

        return results;
      } catch (error) {
        return handleError(error as Error, 'search');
      }
    },

    // Wrap collection (pass-through)
    collection(name: string): VectorDB {
      return db.collection(name);
    },

    // Wrap stats (pass-through)
    async stats(): Promise<DBStats> {
      return db.stats();
    },

    // Wrap clear with middleware
    async clear(): Promise<void> {
      try {
        if (middleware.beforeClear) {
          const allowed = await middleware.beforeClear();
          if (!allowed) return;
        }
        await db.clear();
        if (middleware.afterClear) {
          await middleware.afterClear();
        }
      } catch (error) {
        await handleError(error as Error, 'clear');
      }
    },

    // Wrap close (pass-through)
    async close(): Promise<void> {
      return db.close();
    },

    // Wrap export (pass-through)
    async export(exportOptions?: ExportOptions): Promise<Blob> {
      return db.export(exportOptions);
    },

    // Wrap import (pass-through)
    async import(data: Blob, importOptions?: ImportOptions): Promise<void> {
      return db.import(data, importOptions);
    },

    // Pass-through for lock manager
    getLockManager() {
      return db.getLockManager();
    },

    // Pass-through for broadcaster
    getBroadcaster() {
      return db.getBroadcaster();
    },
  };

  return wrapped;
}
