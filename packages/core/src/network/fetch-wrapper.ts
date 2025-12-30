/**
 * Fetch Wrapper with Logging
 *
 * Wrap fetch to automatically log all network requests.
 *
 * @packageDocumentation
 */

import type { NetworkLogEntry, ProgressCallback } from './types.js';
import { getGlobalLogger } from './logger.js';

// ============================================================================
// Logging Fetch
// ============================================================================

/**
 * Options for creating a logging fetch function.
 */
export interface LoggingFetchOptions {
  /** Category for all requests made with this fetch */
  category?: string;

  /** Progress callback for download/upload progress */
  onProgress?: ProgressCallback;

  /** Whether to log request headers */
  logHeaders?: boolean;

  /** Custom category resolver based on URL */
  categoryResolver?: (url: string) => string;
}

/**
 * Create a fetch function that logs all requests.
 *
 * @param options - Logging options
 * @returns Fetch function with logging
 *
 * @example
 * ```typescript
 * import { createLoggingFetch } from '@localmode/core';
 *
 * const modelFetch = createLoggingFetch({
 *   category: 'model',
 *   onProgress: (loaded, total, url) => {
 *     console.log(`${url}: ${(loaded / total * 100).toFixed(1)}%`);
 *   },
 * });
 *
 * const response = await modelFetch('https://huggingface.co/model.bin');
 * ```
 */
export function createLoggingFetch(
  options: LoggingFetchOptions = {}
): typeof fetch {
  const { category = 'other', onProgress, logHeaders = false, categoryResolver } = options;

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? 'GET').toUpperCase() as NetworkLogEntry['method'];
    const resolvedCategory = categoryResolver ? categoryResolver(url) : category;

    const logger = getGlobalLogger();
    const startTime = performance.now();

    // Log the request start
    const entry = logger.log({
      type: method === 'GET' || method === 'HEAD' ? 'download' : 'upload',
      url,
      method,
      state: 'pending',
      category: resolvedCategory,
      requestHeaders: logHeaders && init?.headers
        ? Object.fromEntries(new Headers(init.headers).entries())
        : undefined,
      requestSize: init?.body
        ? (typeof init.body === 'string' ? init.body.length : 0)
        : undefined,
    });

    try {
      // Update to in-progress
      logger.update(entry.id, { state: 'in-progress' });

      const response = await fetch(input, init);

      // Get response size if possible
      const contentLength = response.headers.get('content-length');
      const responseSize = contentLength ? parseInt(contentLength, 10) : undefined;

      // For progress tracking, we need to consume the body
      if (onProgress && responseSize) {
        const body = response.body;
        if (body) {
          const trackedResponse = trackProgress(
            response,
            body,
            responseSize,
            (loaded, total) => {
              logger.update(entry.id, {
                progress: Math.round((loaded / total) * 100),
              });
              onProgress(loaded, total, url);
            }
          );

          // Update final state
          const duration = performance.now() - startTime;
          logger.update(entry.id, {
            state: 'completed',
            status: response.status,
            statusText: response.statusText,
            responseSize,
            duration,
            progress: 100,
            responseHeaders: logHeaders
              ? Object.fromEntries(response.headers.entries())
              : undefined,
          });

          return trackedResponse;
        }
      }

      // Update with response info
      const duration = performance.now() - startTime;
      logger.update(entry.id, {
        state: 'completed',
        status: response.status,
        statusText: response.statusText,
        responseSize,
        duration,
        progress: 100,
        responseHeaders: logHeaders
          ? Object.fromEntries(response.headers.entries())
          : undefined,
      });

      return response;
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.update(entry.id, {
        state: 'failed',
        error: error instanceof Error ? error.message : String(error),
        duration,
      });
      throw error;
    }
  };
}

/**
 * Track progress of a streaming response.
 */
function trackProgress(
  response: Response,
  body: ReadableStream<Uint8Array>,
  total: number,
  onProgress: (loaded: number, total: number) => void
): Response {
  let loaded = 0;

  const reader = body.getReader();
  const stream = new ReadableStream({
    async start(controller) {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          controller.close();
          break;
        }

        loaded += value.length;
        onProgress(loaded, total);
        controller.enqueue(value);
      }
    },
  });

  return new Response(stream, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}

// ============================================================================
// Global Fetch Wrapper
// ============================================================================

let originalFetch: typeof fetch | null = null;

/**
 * Wrap the global fetch with logging.
 *
 * @param options - Category mapping and options
 *
 * @example
 * ```typescript
 * import { wrapFetchWithLogging } from '@localmode/core';
 *
 * wrapFetchWithLogging({
 *   categories: {
 *     'huggingface.co': 'model',
 *     'cdn.example.com': 'data',
 *   },
 * });
 *
 * // Now all fetch calls are logged
 * const response = await fetch('https://huggingface.co/model.bin');
 * ```
 */
export function wrapFetchWithLogging(options: {
  categories?: Record<string, string>;
  onProgress?: ProgressCallback;
  logHeaders?: boolean;
} = {}): void {
  if (typeof globalThis.fetch === 'undefined') return;
  if (originalFetch) return; // Already wrapped

  originalFetch = globalThis.fetch;

  const categoryResolver = options.categories
    ? (url: string) => {
        for (const [pattern, category] of Object.entries(options.categories!)) {
          if (url.includes(pattern)) return category;
        }
        return 'other';
      }
    : undefined;

  const loggingFetch = createLoggingFetch({
    category: 'other',
    categoryResolver,
    onProgress: options.onProgress,
    logHeaders: options.logHeaders,
  });

  globalThis.fetch = loggingFetch as typeof fetch;
}

/**
 * Restore the original fetch function.
 */
export function unwrapFetch(): void {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
    originalFetch = null;
  }
}

/**
 * Check if fetch is currently wrapped.
 */
export function isFetchWrapped(): boolean {
  return originalFetch !== null;
}

