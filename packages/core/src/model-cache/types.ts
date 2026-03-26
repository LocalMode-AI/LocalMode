/**
 * Model Cache Types
 *
 * Type definitions for the chunked model download cache with LRU eviction.
 *
 * @packageDocumentation
 */

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for {@link createModelLoader}.
 */
export interface ModelLoaderConfig {
  /** IndexedDB database name for the cache. Default: `'localmode-model-cache'` */
  cacheName?: string;

  /**
   * Maximum total cache size.
   * Accepts a number (bytes) or a human-readable string (`'2GB'`, `'512MB'`).
   * Default: `2147483648` (2 GB)
   */
  maxCacheSize?: string | number;

  /** Size of each download chunk in bytes. Default: `16777216` (16 MB) */
  chunkSize?: number;

  /** Eviction strategy. Currently only `'lru'` is supported. */
  evictionStrategy?: 'lru';

  /** Maximum number of retry attempts per chunk download. Default: `3` */
  maxRetries?: number;

  /** Base delay between retries in milliseconds (exponential backoff). Default: `1000` */
  retryDelayMs?: number;

  /** Progress callback invoked during model downloads. */
  onProgress?: (modelId: string, progress: ModelDownloadProgress) => void;
}

// ============================================================================
// Download Types
// ============================================================================

/**
 * Progress information for an in-flight model download.
 */
export interface ModelDownloadProgress {
  /** Identifier of the model being downloaded. */
  modelId: string;

  /** Number of bytes downloaded so far. */
  downloadedBytes: number;

  /** Total size of the model in bytes. */
  totalBytes: number;

  /** Download progress as a fraction between 0 and 1. */
  progress: number;

  /** Number of chunks that have been written to the store. */
  chunksComplete: number;

  /** Total number of chunks required. */
  chunksTotal: number;
}

/**
 * A request to download a model file.
 */
export interface ModelDownloadRequest {
  /** URL of the model file. */
  url: string;

  /** Unique identifier for the model (used as the cache key). */
  modelId: string;
}

/**
 * Options for {@link ModelLoader.prefetchOne}.
 */
export interface PrefetchOptions {
  /** Signal to abort the download. */
  abortSignal?: AbortSignal;
}

// ============================================================================
// Cache Status
// ============================================================================

/**
 * Status of a single model in the cache.
 */
export interface CacheEntry {
  /** Unique model identifier. */
  modelId: string;

  /** Current status of the cached model. */
  status: 'cached' | 'downloading' | 'partial' | 'error';

  /** Download progress (0-1). Only present while downloading. */
  progress?: number;

  /** Size of the cached data in bytes. */
  sizeBytes: number;

  /** When the model was last accessed (read or written). */
  lastAccessed: Date;

  /** Number of chunks stored. */
  chunkCount: number;

  /** Original download URL, if known. */
  url?: string;
}

// ============================================================================
// ModelLoader Interface
// ============================================================================

/**
 * High-level interface for downloading, caching, and managing ML model files.
 *
 * Returned by {@link createModelLoader}.
 */
export interface ModelLoader {
  /**
   * Prefetch multiple models. Downloads are processed sequentially.
   *
   * @param requests - Array of model download requests
   */
  prefetch(requests: ModelDownloadRequest[]): Promise<void>;

  /**
   * Prefetch a single model by URL.
   * The model ID is derived from the URL unless already cached.
   *
   * @param url - URL of the model file
   * @param options - Optional abort signal
   */
  prefetchOne(url: string, options?: PrefetchOptions): Promise<void>;

  /**
   * Cancel an in-progress download for a specific model.
   *
   * @param modelId - Model to cancel
   */
  cancel(modelId: string): void;

  /** Cancel all in-progress downloads. */
  cancelAll(): void;

  /**
   * Evict a model from the cache.
   *
   * @param modelId - Model to remove
   */
  evict(modelId: string): Promise<void>;

  /**
   * Reassemble cached chunks into a single Blob.
   *
   * @param modelId - Model to retrieve
   * @returns The model file as a Blob, or `null` if not cached
   */
  getBlob(modelId: string): Promise<Blob | null>;

  /**
   * Get the status of every model in the cache.
   *
   * @returns Map of model ID to cache entry
   */
  getCacheStatus(): Promise<Map<string, CacheEntry>>;

  /**
   * Get the cache entry for a single model.
   *
   * @param modelId - Model to query
   * @returns Cache entry, or `null` if not cached
   */
  getCacheEntry(modelId: string): Promise<CacheEntry | null>;

  /**
   * Check whether a model is fully cached.
   *
   * @param modelId - Model to check
   * @returns `true` if the model is cached and complete
   */
  isModelCached(modelId: string): Promise<boolean>;

  /**
   * Get the total size of all cached models in bytes.
   *
   * @returns Total cache size
   */
  getTotalCacheSize(): Promise<number>;

  /**
   * Destroy the loader, closing the underlying IndexedDB connection.
   */
  destroy(): Promise<void>;
}

// ============================================================================
// Internal Metadata
// ============================================================================

/**
 * Internal metadata record stored per model in IndexedDB.
 */
export interface ModelMetadataRecord {
  /** Unique model identifier (primary key). */
  modelId: string;

  /** Original download URL. */
  url: string;

  /** Total size of the model in bytes. */
  totalBytes: number;

  /** Expected number of chunks. */
  chunkCount: number;

  /** Size of each chunk in bytes. */
  chunkSize: number;

  /** Whether the download is complete, partial, or errored. */
  status: 'complete' | 'partial' | 'error';

  /** When the model was last accessed. */
  lastAccessed: Date;

  /** When the model was first cached. */
  createdAt: Date;
}
