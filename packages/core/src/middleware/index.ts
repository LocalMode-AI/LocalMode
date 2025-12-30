/**
 * Middleware Module
 *
 * Production-essential middleware for VectorDB and models.
 *
 * @packageDocumentation
 */

// Export types
export * from './types.js';

// Export VectorDB middleware
export { wrapVectorDB, composeVectorDBMiddleware } from './vectordb.js';
export type { WrapVectorDBOptions } from './vectordb.js';

// Export built-in middleware implementations
export { cachingMiddleware, createCachingMiddleware } from './caching.js';
export { loggingMiddleware, createLoggingMiddleware } from './logging.js';
export { validationMiddleware, createValidationMiddleware } from './validation.js';
export { retryMiddleware, createRetryMiddleware, RetryPredicates, DEFAULT_RETRY_OPTIONS } from './retry.js';
export { rateLimitMiddleware, createRateLimitMiddleware, TokenBucket, DEFAULT_RATE_LIMIT_OPTIONS } from './rate-limit.js';

// Re-export embedding middleware from embeddings module for convenience
export { wrapEmbeddingModel, composeEmbeddingMiddleware } from '../embeddings/middleware.js';

