/**
 * Rate Limit Middleware
 *
 * Provides rate limiting to prevent overwhelming APIs or local resources.
 *
 * @packageDocumentation
 */

import type { EmbeddingModelMiddleware } from '../embeddings/types.js';
import type { RateLimitMiddlewareOptions } from './types.js';

// ============================================================================
// Rate Limit Middleware
// ============================================================================

/**
 * Default rate limit options.
 */
export const DEFAULT_RATE_LIMIT_OPTIONS: Required<Omit<RateLimitMiddlewareOptions, 'onRateLimit'>> = {
  maxRequests: 100,
  windowMs: 1000,
  queue: false,
  maxQueueSize: 1000,
};

/**
 * Create a rate limiting middleware for embedding models.
 *
 * Limits the number of requests within a time window to prevent overloading.
 *
 * @param options - Rate limit configuration
 * @returns Embedding model middleware
 *
 * @example
 * ```typescript
 * import { wrapEmbeddingModel, rateLimitMiddleware } from '@localmode/core';
 *
 * const rateLimitedModel = wrapEmbeddingModel({
 *   model: transformers.embedding('Xenova/all-MiniLM-L6-v2'),
 *   middleware: rateLimitMiddleware({
 *     maxRequests: 10,
 *     windowMs: 1000, // 10 requests per second
 *     onRateLimit: (waitMs) => {
 *       console.log(`Rate limited, waiting ${waitMs}ms`);
 *     },
 *   }),
 * });
 * ```
 */
export function rateLimitMiddleware(
  options: RateLimitMiddlewareOptions = {}
): EmbeddingModelMiddleware {
  const config = { ...DEFAULT_RATE_LIMIT_OPTIONS, ...options };

  // Track request timestamps
  const requestTimestamps: number[] = [];
  const requestQueue: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];

  let processingQueue = false;

  const getWaitTime = (): number => {
    const now = Date.now();

    // Remove old timestamps outside the window
    while (requestTimestamps.length > 0 && requestTimestamps[0] < now - config.windowMs) {
      requestTimestamps.shift();
    }

    if (requestTimestamps.length < config.maxRequests) {
      return 0;
    }

    // Calculate wait time until oldest request expires
    return requestTimestamps[0] + config.windowMs - now;
  };

  const processQueue = async () => {
    if (processingQueue || requestQueue.length === 0) return;
    processingQueue = true;

    while (requestQueue.length > 0) {
      const waitTime = getWaitTime();

      if (waitTime > 0) {
        await sleep(waitTime);
      }

      const request = requestQueue.shift();
      if (request) {
        requestTimestamps.push(Date.now());
        request.resolve();
      }
    }

    processingQueue = false;
  };

  return {
    wrapEmbed: async ({ doEmbed }) => {
      const waitTime = getWaitTime();

      if (waitTime > 0) {
        if (config.queue) {
          // Queue the request
          if (requestQueue.length >= config.maxQueueSize) {
            throw new Error('Rate limit queue full');
          }

          options.onRateLimit?.(waitTime);

          await new Promise<void>((resolve, reject) => {
            requestQueue.push({ resolve, reject });
            processQueue();
          });
        } else {
          // Wait inline
          options.onRateLimit?.(waitTime);
          await sleep(waitTime);
        }
      }

      // Record this request
      requestTimestamps.push(Date.now());

      return doEmbed();
    },
  };
}

/**
 * Create a rate limit middleware with custom configuration.
 */
export function createRateLimitMiddleware(
  options: RateLimitMiddlewareOptions = {}
): EmbeddingModelMiddleware {
  return rateLimitMiddleware(options);
}

// ============================================================================
// Token Bucket Rate Limiter
// ============================================================================

/**
 * Token bucket rate limiter options.
 */
export interface TokenBucketOptions {
  /** Maximum tokens in the bucket */
  maxTokens: number;

  /** Tokens added per interval */
  refillRate: number;

  /** Interval in milliseconds */
  refillIntervalMs: number;
}

/**
 * A token bucket rate limiter.
 *
 * Provides smooth rate limiting with burst capacity.
 *
 * @example
 * ```typescript
 * const bucket = new TokenBucket({
 *   maxTokens: 100,
 *   refillRate: 10,
 *   refillIntervalMs: 1000, // 10 tokens per second, max 100
 * });
 *
 * if (bucket.tryConsume(1)) {
 *   // Proceed with operation
 * } else {
 *   // Rate limited
 * }
 * ```
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly options: TokenBucketOptions;

  constructor(options: TokenBucketOptions) {
    this.options = options;
    this.tokens = options.maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on elapsed time.
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const intervalsElapsed = Math.floor(elapsed / this.options.refillIntervalMs);

    if (intervalsElapsed > 0) {
      this.tokens = Math.min(
        this.options.maxTokens,
        this.tokens + intervalsElapsed * this.options.refillRate
      );
      this.lastRefill = now;
    }
  }

  /**
   * Try to consume tokens from the bucket.
   *
   * @param count - Number of tokens to consume
   * @returns true if tokens were consumed, false if not enough tokens
   */
  tryConsume(count: number = 1): boolean {
    this.refill();

    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }

    return false;
  }

  /**
   * Wait until tokens are available, then consume.
   *
   * @param count - Number of tokens to consume
   * @param timeout - Maximum time to wait in milliseconds
   * @returns Promise that resolves when tokens are consumed
   */
  async consume(count: number = 1, timeout?: number): Promise<void> {
    const startTime = Date.now();

    while (!this.tryConsume(count)) {
      if (timeout && Date.now() - startTime >= timeout) {
        throw new Error('Token bucket timeout');
      }

      // Wait for next refill interval
      await sleep(this.options.refillIntervalMs);
    }
  }

  /**
   * Get the current number of tokens.
   */
  getTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Check if tokens are available without consuming.
   */
  hasTokens(count: number = 1): boolean {
    this.refill();
    return this.tokens >= count;
  }

  /**
   * Get estimated wait time for tokens.
   */
  getWaitTime(count: number = 1): number {
    this.refill();

    if (this.tokens >= count) {
      return 0;
    }

    const needed = count - this.tokens;
    const intervalsNeeded = Math.ceil(needed / this.options.refillRate);
    return intervalsNeeded * this.options.refillIntervalMs;
  }
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

