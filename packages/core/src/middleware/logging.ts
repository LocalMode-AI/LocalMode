/**
 * Logging Middleware
 *
 * Log VectorDB operations for debugging and monitoring.
 *
 * @packageDocumentation
 */

import type { Document, SearchResult, SearchOptions } from '../types.js';
import type { VectorDBMiddleware, LoggingMiddlewareOptions } from './types.js';

/**
 * Create logging middleware for VectorDB.
 *
 * @example
 * ```typescript
 * import { createVectorDB, wrapVectorDB, loggingMiddleware } from '@localmode/core';
 *
 * const db = await createVectorDB({ name: 'my-db', dimensions: 384 });
 *
 * const loggedDb = wrapVectorDB({
 *   db,
 *   middleware: loggingMiddleware({
 *     level: 'info',
 *     timing: true,
 *   }),
 * });
 * ```
 */
export function loggingMiddleware(options: LoggingMiddlewareOptions = {}): VectorDBMiddleware {
  const {
    logger = console.log,
    level = 'info',
    timing = true,
    operations = ['add', 'get', 'delete', 'search', 'clear'],
    formatter,
  } = options;

  const shouldLog = (op: string): boolean => operations.includes(op as never);

  const log = (operation: string, data: Record<string, unknown>): void => {
    if (formatter) {
      logger(formatter(operation, data));
    } else {
      const prefix = `[VectorDB:${level.toUpperCase()}]`;
      logger(prefix, operation, data);
    }
  };

  const timers = new Map<string, number>();

  const startTimer = (id: string): void => {
    if (timing) {
      timers.set(id, performance.now());
    }
  };

  const getElapsed = (id: string): number | undefined => {
    const start = timers.get(id);
    timers.delete(id);
    if (start === undefined) return undefined;
    return performance.now() - start;
  };

  return {
    beforeAdd: async (doc: Document) => {
      if (shouldLog('add')) {
        startTimer(`add:${doc.id}`);
        log('add:start', { id: doc.id, hasVector: !!doc.vector, hasMetadata: !!doc.metadata });
      }
      return doc;
    },

    afterAdd: async (doc: Document) => {
      if (shouldLog('add')) {
        const elapsed = getElapsed(`add:${doc.id}`);
        log('add:complete', { id: doc.id, durationMs: elapsed });
      }
    },

    afterGet: async (doc: Document | undefined) => {
      if (shouldLog('get')) {
        log('get', { id: doc?.id, found: !!doc });
      }
      return doc;
    },

    beforeDelete: async (id: string) => {
      if (shouldLog('delete')) {
        startTimer(`delete:${id}`);
        log('delete:start', { id });
      }
      return true;
    },

    afterDelete: async (id: string) => {
      if (shouldLog('delete')) {
        const elapsed = getElapsed(`delete:${id}`);
        log('delete:complete', { id, durationMs: elapsed });
      }
    },

    beforeSearch: async (query: Float32Array, searchOptions: SearchOptions) => {
      if (shouldLog('search')) {
        const searchId = `search:${Date.now()}`;
        startTimer(searchId);
        (searchOptions as Record<string, unknown>).__searchId = searchId;
        log('search:start', {
          k: searchOptions.k ?? 10,
          hasFilter: !!searchOptions.filter,
          dimensions: query.length,
        });
      }
      return { query, options: searchOptions };
    },

    afterSearch: async (results: SearchResult[]) => {
      if (shouldLog('search')) {
        log('search:complete', {
          resultCount: results.length,
          topScore: results[0]?.score,
        });
      }
      return results;
    },

    beforeClear: async () => {
      if (shouldLog('clear')) {
        startTimer('clear');
        log('clear:start', {});
      }
      return true;
    },

    afterClear: async () => {
      if (shouldLog('clear')) {
        const elapsed = getElapsed('clear');
        log('clear:complete', { durationMs: elapsed });
      }
    },

    onError: async (error: Error, operation: string) => {
      log('error', { operation, message: error.message, name: error.name });
      return false; // Don't suppress errors
    },
  };
}

/**
 * Alias for loggingMiddleware.
 */
export const createLoggingMiddleware = loggingMiddleware;

