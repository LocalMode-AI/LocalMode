/**
 * Retry Middleware
 *
 * Provides retry logic with exponential backoff for transient failures.
 *
 * @packageDocumentation
 */

import type { EmbeddingModelMiddleware } from '../embeddings/types.js';
import type { RetryMiddlewareOptions } from './types.js';

// ============================================================================
// Retry Middleware for Embedding Models
// ============================================================================

/**
 * Default retry options.
 */
export const DEFAULT_RETRY_OPTIONS: Required<RetryMiddlewareOptions> = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  jitter: true,
  shouldRetry: () => true,
};

/**
 * Create a retry middleware for embedding models.
 *
 * Automatically retries failed embedding operations with exponential backoff.
 *
 * @param options - Retry configuration
 * @returns Embedding model middleware
 *
 * @example
 * ```typescript
 * import { wrapEmbeddingModel, retryMiddleware } from '@localmode/core';
 *
 * const resilientModel = wrapEmbeddingModel({
 *   model: transformers.embedding('Xenova/all-MiniLM-L6-v2'),
 *   middleware: retryMiddleware({
 *     maxRetries: 3,
 *     initialDelayMs: 100,
 *     shouldRetry: (error) => error.message.includes('timeout'),
 *   }),
 * });
 * ```
 */
export function retryMiddleware(
  options: RetryMiddlewareOptions = {}
): EmbeddingModelMiddleware {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };

  return {
    wrapEmbed: async ({ doEmbed }) => {
      let lastError: Error | undefined;

      for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
        try {
          return await doEmbed();
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          // Check if we should retry
          if (attempt === config.maxRetries || !config.shouldRetry(lastError, attempt + 1)) {
            throw lastError;
          }

          // Calculate delay with exponential backoff
          let delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
          delay = Math.min(delay, config.maxDelayMs);

          // Add jitter if enabled (±25%)
          if (config.jitter) {
            const jitterRange = delay * 0.25;
            delay = delay - jitterRange + Math.random() * jitterRange * 2;
          }

          // Wait before retry
          await sleep(delay);
        }
      }

      // Should never reach here, but TypeScript needs this
      throw lastError ?? new Error('Retry failed');
    },
  };
}

/**
 * Create a retry middleware with custom configuration.
 */
export function createRetryMiddleware(
  options: RetryMiddlewareOptions = {}
): EmbeddingModelMiddleware {
  return retryMiddleware(options);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Sleep for a specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Common retry predicates.
 */
export const RetryPredicates = {
  /**
   * Retry on network errors.
   */
  networkErrors: (error: Error): boolean => {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('fetch') ||
      message.includes('connection')
    );
  },

  /**
   * Retry on rate limit errors (429 status).
   */
  rateLimitErrors: (error: Error): boolean => {
    return error.message.includes('429') || error.message.toLowerCase().includes('rate limit');
  },

  /**
   * Retry on server errors (5xx status).
   */
  serverErrors: (error: Error): boolean => {
    const message = error.message;
    return /\b5\d{2}\b/.test(message) || message.toLowerCase().includes('server error');
  },

  /**
   * Retry on all recoverable errors.
   */
  recoverableErrors: (error: Error): boolean => {
    return (
      RetryPredicates.networkErrors(error) ||
      RetryPredicates.rateLimitErrors(error) ||
      RetryPredicates.serverErrors(error)
    );
  },

  /**
   * Never retry (for testing).
   */
  never: (): boolean => false,

  /**
   * Always retry.
   */
  always: (): boolean => true,
} as const;

