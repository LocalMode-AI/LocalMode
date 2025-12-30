/**
 * Middleware Types
 *
 * Type definitions for model and VectorDB middleware systems.
 * Part of the production-essential extensibility system.
 *
 * @packageDocumentation
 */

import type { Document, SearchOptions, SearchResult } from '../types.js';

// ============================================================================
// VectorDB Middleware Types
// ============================================================================

/**
 * Middleware for VectorDB operations.
 *
 * Allows intercepting and modifying VectorDB operations for:
 * - Encryption/decryption of vectors and metadata
 * - Audit logging
 * - Data transformation
 * - Access control
 * - Caching
 *
 * @example
 * ```typescript
 * import { wrapVectorDB, VectorDBMiddleware } from '@localmode/core';
 *
 * const loggingMiddleware: VectorDBMiddleware = {
 *   beforeAdd: async (doc) => {
 *     console.log('Adding:', doc.id);
 *     return doc;
 *   },
 *   afterSearch: async (results) => {
 *     console.log('Found:', results.length, 'results');
 *     return results;
 *   },
 * };
 *
 * const db = wrapVectorDB({ db: originalDb, middleware: loggingMiddleware });
 * ```
 */
export interface VectorDBMiddleware {
  /**
   * Transform document before adding to the database.
   * Return modified document or throw to reject.
   */
  beforeAdd?: (document: Document) => Document | Promise<Document>;

  /**
   * Called after document is added to the database.
   */
  afterAdd?: (document: Document) => void | Promise<void>;

  /**
   * Transform document after retrieval from the database.
   * Return modified document or undefined to filter out.
   */
  afterGet?: (document: Document | undefined) => Document | undefined | Promise<Document | undefined>;

  /**
   * Called before document deletion.
   * Return false to prevent deletion.
   */
  beforeDelete?: (id: string) => boolean | Promise<boolean>;

  /**
   * Called after document deletion.
   */
  afterDelete?: (id: string) => void | Promise<void>;

  /**
   * Transform search options before search execution.
   */
  beforeSearch?: (
    query: Float32Array,
    options: SearchOptions
  ) => { query: Float32Array; options: SearchOptions } | Promise<{ query: Float32Array; options: SearchOptions }>;

  /**
   * Transform search results after search execution.
   */
  afterSearch?: (results: SearchResult[]) => SearchResult[] | Promise<SearchResult[]>;

  /**
   * Called before database clear operation.
   * Return false to prevent clear.
   */
  beforeClear?: () => boolean | Promise<boolean>;

  /**
   * Called after database clear operation.
   */
  afterClear?: () => void | Promise<void>;

  /**
   * Error handler for any operation.
   * Return true to suppress the error.
   */
  onError?: (error: Error, operation: string) => boolean | void | Promise<boolean | void>;
}

// ============================================================================
// Built-in Middleware Options Types
// ============================================================================

/**
 * Options for caching middleware.
 */
export interface CachingMiddlewareOptions {
  /** Maximum number of cached search results (default: 100) */
  maxSearchResults?: number;

  /** Cache TTL in milliseconds (default: 60000 = 1 minute) */
  ttlMs?: number;

  /** Maximum number of cached embeddings (default: 1000) */
  maxEmbeddings?: number;

  /** Whether to cache search results (default: true) */
  cacheSearchResults?: boolean;

  /** Whether to cache document retrievals (default: true) */
  cacheDocuments?: boolean;
}

/**
 * Options for logging middleware.
 */
export interface LoggingMiddlewareOptions {
  /** Logger function (default: console.log) */
  logger?: (...args: unknown[]) => void;

  /** Log level (default: 'info') */
  level?: 'debug' | 'info' | 'warn' | 'error';

  /** Whether to log timing information (default: true) */
  timing?: boolean;

  /** Operations to log (default: all) */
  operations?: Array<'add' | 'get' | 'delete' | 'search' | 'clear'>;

  /** Custom formatter for log messages */
  formatter?: (operation: string, data: Record<string, unknown>) => string;
}

/**
 * Options for retry middleware.
 */
export interface RetryMiddlewareOptions {
  /** Maximum number of retries (default: 3) */
  maxRetries?: number;

  /** Initial delay in milliseconds (default: 100) */
  initialDelayMs?: number;

  /** Maximum delay in milliseconds (default: 5000) */
  maxDelayMs?: number;

  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;

  /** Whether to use jitter (default: true) */
  jitter?: boolean;

  /** Error filter - return true to retry (default: retry all) */
  shouldRetry?: (error: Error, attempt: number) => boolean;
}

/**
 * Options for rate limiting middleware.
 */
export interface RateLimitMiddlewareOptions {
  /** Maximum requests per window (default: 100) */
  maxRequests?: number;

  /** Window size in milliseconds (default: 1000) */
  windowMs?: number;

  /** Whether to queue requests when limit is reached (default: false) */
  queue?: boolean;

  /** Maximum queue size (default: 1000) */
  maxQueueSize?: number;

  /** Callback when rate limit is reached */
  onRateLimit?: (waitMs: number) => void;
}

/**
 * Options for validation middleware.
 */
export interface ValidationMiddlewareOptions {
  /** Validate vector dimensions */
  dimensions?: number;

  /** Validate vector values (no NaN/Infinity) (default: true) */
  validateValues?: boolean;

  /** Validate metadata (default: true) */
  validateMetadata?: boolean;

  /** Maximum metadata size in bytes (default: 1MB) */
  maxMetadataSize?: number;

  /** Maximum text content length (default: 100KB) */
  maxTextLength?: number;

  /** Custom validator function */
  customValidator?: (document: Document) => boolean | string;
}

/**
 * Options for encryption middleware.
 */
export interface EncryptionMiddlewareOptions {
  /** Encryption key (CryptoKey) */
  key: CryptoKey;

  /** Whether to encrypt vectors (default: true) */
  encryptVectors?: boolean;

  /** Whether to encrypt metadata (default: true) */
  encryptMetadata?: boolean;

  /** Whether to encrypt text content (default: true) */
  encryptText?: boolean;

  /** Fields to exclude from encryption */
  excludeFields?: string[];
}

/**
 * Options for PII redaction middleware.
 */
export interface PIIRedactionMiddlewareOptions {
  /** Redact email addresses (default: true) */
  emails?: boolean;

  /** Redact phone numbers (default: true) */
  phones?: boolean;

  /** Redact SSN patterns (default: true) */
  ssn?: boolean;

  /** Redact credit card numbers (default: true) */
  creditCards?: boolean;

  /** Redact IP addresses (default: false) */
  ipAddresses?: boolean;

  /** Custom patterns to redact */
  customPatterns?: Array<{ pattern: RegExp; replacement: string }>;

  /** Replacement text for redacted content (default: '[REDACTED]') */
  replacement?: string;
}

