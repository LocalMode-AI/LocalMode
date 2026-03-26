import type { QuantizationConfig, ScalarCalibrationData, PQCodebook } from './quantization/types.js';
import type { ModelFingerprint } from './embeddings/types.js';
import type { HNSWGPUOptions } from './hnsw/gpu/types.js';

/**
 * Encryption configuration options.
 */
export interface EncryptionOptions {
  /** Enable encryption at rest */
  enabled: boolean;
  /** Passphrase for encryption (required if enabled) */
  passphrase?: string;
  /** Key derivation iterations (higher = more secure, slower). Default: 100000 */
  iterations?: number;
}

/**
 * Sync configuration options.
 */
export interface SyncOptions {
  /** Enable cross-tab locking with Web Locks API. Default: true */
  enableLocking?: boolean;
  /** Enable cross-tab notifications with BroadcastChannel. Default: true */
  enableBroadcast?: boolean;
  /** Enable Write-Ahead Log for crash recovery. Default: false */
  enableWAL?: boolean;
}

/**
 * Configuration options for creating a VectorDB instance.
 *
 * @typeParam TMetadata - Shape of the metadata object for type-safe operations.
 */
export interface VectorDBConfig<TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  /** Database name (used for IndexedDB store name) */
  name: string;

  /** Number of dimensions for vectors */
  dimensions: number;

  /**
   * Storage backend.
   * - `'indexeddb'` — persistent IndexedDB storage (default)
   * - `'memory'` — in-memory storage for testing
   * - `StorageAdapter` instance — custom storage backend (e.g., DexieStorage, IDBStorage)
   */
  storage?: 'indexeddb' | 'memory' | import('./storage/types.js').StorageAdapter;

  /** HNSW index configuration options */
  indexOptions?: HNSWOptions;

  /** Encryption configuration */
  encryption?: EncryptionOptions;

  /** Sync and recovery options */
  sync?: SyncOptions;

  /** Vector quantization configuration. Reduces storage by 4x with minimal recall loss. */
  quantization?: QuantizationConfig;

  /**
   * Storage compression for IndexedDB. Reduces disk usage without affecting
   * search recall. Independent of the `quantization` option.
   *
   * When enabled, vectors are compressed using SQ8 before writing to IndexedDB
   * and decompressed on read. The HNSW index always uses original Float32Array
   * vectors, so search quality is completely unaffected.
   *
   * @example
   * ```ts
   * const db = await createVectorDB({
   *   name: 'docs',
   *   dimensions: 384,
   *   compression: { type: 'sq8' },
   * });
   * ```
   */
  compression?: import('./storage/compression.js').CompressionConfig;

  /**
   * Optional metadata schema for runtime validation.
   * When provided, `add()` and `addMany()` validate metadata against this schema.
   * Reuses the same `ObjectSchema` interface used by `generateObject()`.
   *
   * @example
   * ```ts
   * import { createVectorDB, jsonSchema } from '@localmode/core';
   * import { z } from 'zod';
   *
   * const db = await createVectorDB({
   *   name: 'articles',
   *   dimensions: 384,
   *   schema: jsonSchema(z.object({ title: z.string(), category: z.string() })),
   * });
   * ```
   */
  schema?: import('./generation/types.js').ObjectSchema<TMetadata>;

  /**
   * Optional embedding model reference for drift detection.
   * When provided, the model's fingerprint is stored with the collection
   * and compared on subsequent initializations to detect model changes.
   */
  model?: import('./embeddings/types.js').EmbeddingModel;

  /**
   * Enable WebGPU-accelerated vector distance computation.
   * When true, the underlying HNSW index uses GPU compute shaders for
   * batch distance computation during search. Falls back to CPU silently
   * when WebGPU is unavailable.
   *
   * This is a convenience flag equivalent to setting `indexOptions.gpu.enabled: true`.
   * If both `enableGPU` and `indexOptions.gpu` are set, the explicit
   * `indexOptions.gpu` settings take precedence.
   *
   * @example
   * ```ts
   * const db = await createVectorDB({
   *   name: 'docs',
   *   dimensions: 384,
   *   enableGPU: true,
   * });
   * ```
   */
  enableGPU?: boolean;
}

/**
 * HNSW algorithm configuration options.
 */
export interface HNSWOptions {
  /** Maximum number of connections per node (default: 16) */
  m?: number;

  /** Size of dynamic candidate list during construction (default: 200) */
  efConstruction?: number;

  /** Size of dynamic candidate list during search (default: 50) */
  efSearch?: number;

  /** Distance metric to use (default: 'cosine') */
  distanceFunction?: 'cosine' | 'euclidean' | 'dot';

  /**
   * GPU acceleration options for search operations.
   * When `enabled` is true, distance computations are offloaded to WebGPU
   * compute shaders for batch sizes above `batchThreshold`.
   * Falls back to CPU silently when WebGPU is unavailable.
   */
  gpu?: HNSWGPUOptions;
}

/**
 * A document to be stored in the vector database.
 *
 * @typeParam TMetadata - Shape of the metadata object. Defaults to `Record<string, unknown>` for untyped usage.
 */
export interface Document<TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  /** Unique identifier for the document */
  id: string;

  /** Vector embedding (must match configured dimensions) */
  vector: Float32Array;

  /** Optional metadata associated with the document */
  metadata?: TMetadata;
}

/**
 * Options for search operations.
 *
 * @typeParam TMetadata - Shape of the metadata object for type-safe filters.
 */
export interface SearchOptions<TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  /** Number of results to return (default: 10) */
  k?: number;

  /** Metadata filter to apply before/after search */
  filter?: TypedFilterQuery<TMetadata>;

  /** Minimum similarity threshold (0-1 for cosine, depends on metric) */
  threshold?: number;

  /** Whether to include vectors in results (default: false) */
  includeVectors?: boolean;
}

/**
 * A single search result.
 *
 * @typeParam TMetadata - Shape of the metadata object.
 */
export interface SearchResult<TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  /** Document ID */
  id: string;

  /** Similarity score (higher is more similar for cosine/dot, lower for euclidean) */
  score: number;

  /** Document metadata (if stored) */
  metadata?: TMetadata;

  /** Vector embedding (only if includeVectors was true) */
  vector?: Float32Array;
}

/**
 * Filter value operators for a given value type.
 */
export type FilterValueOperators<T> =
  | T
  | { $in: T[] }
  | { $nin: T[] }
  | { $ne: T }
  | { $exists: boolean }
  | (T extends number ? { $gt: number } | { $gte: number } | { $lt: number } | { $lte: number } : never);

/**
 * Type-safe filter query for typed VectorDB metadata.
 * When TMetadata is a specific type, filter keys are constrained to `keyof TMetadata`
 * and operators are typed according to the value type at each key.
 *
 * @typeParam TMetadata - Shape of the metadata object.
 */
export type TypedFilterQuery<TMetadata extends Record<string, unknown> = Record<string, unknown>> =
  { [K in keyof TMetadata]?: FilterValueOperators<TMetadata[K]> };

/**
 * Filter query for metadata filtering (untyped).
 * Supports exact match, $in (any of), $gt, $gte, $lt, $lte operators.
 *
 * @deprecated Prefer `TypedFilterQuery<TMetadata>` for type-safe filters. This alias is kept for backward compatibility.
 */
export type FilterQuery = TypedFilterQuery<Record<string, unknown>>;

/**
 * Options for batch add operations.
 */
export interface AddManyOptions {
  /** Progress callback called after each batch */
  onProgress?: (completed: number, total: number) => void;

  /** Batch size for processing (default: 100) */
  batchSize?: number;
}

/**
 * Options for recalibrating quantization.
 */
export interface RecalibrateOptions {
  /** AbortSignal to cancel the operation */
  abortSignal?: AbortSignal;

  /** Progress callback called during recalibration */
  onProgress?: (completed: number, total: number) => void;
}

/**
 * Options for import operations.
 */
export interface ImportOptions {
  /** How to handle existing data: 'merge' adds/updates, 'replace' clears first */
  mode?: 'merge' | 'replace';

  /** Progress callback */
  onProgress?: (completed: number, total: number) => void;
}

/**
 * Options for export operations.
 */
export interface ExportOptions {
  /** Export format */
  format?: 'json' | 'binary';

  /** Collections to export (default: all) */
  collections?: string[];

  /** Whether to include vectors (default: true) */
  includeVectors?: boolean;
}

/**
 * Database statistics.
 */
export interface DBStats {
  /** Total number of documents across all collections */
  count: number;

  /** List of collection names */
  collections: string[];

  /** Approximate size in bytes */
  sizeBytes: number;

  /** Database schema version */
  version: number;
}

/**
 * Internal document representation with collection info.
 */
export interface StoredDocument {
  id: string;
  collectionId: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/**
 * Internal vector storage representation.
 * The vector field accepts Float32Array (unquantized) or Uint8Array (quantized).
 */
export interface StoredVector {
  id: string;
  collectionId: string;
  vector: Float32Array | Uint8Array;
}

/**
 * Internal collection representation.
 */
export interface Collection {
  id: string;
  name: string;
  dimensions: number;
  createdAt: number;
  /** Scalar quantization calibration data (set when quantization is enabled) */
  calibration?: ScalarCalibrationData;
  /** Fingerprint of the embedding model that produced this collection's vectors */
  modelFingerprint?: ModelFingerprint;
  /** Product quantization codebook (set when PQ is enabled) */
  pqCodebook?: PQCodebook;
  /** Storage compression mode (set when compression is enabled) */
  compression?: { type: 'sq8' | 'delta-sq8' | 'none' };
  /** Calibration data for storage compression (separate from quantization calibration) */
  compressionCalibration?: ScalarCalibrationData;
  /** Delta calibration for delta-sq8 compression mode */
  deltaCalibration?: ScalarCalibrationData;
}

/**
 * The main VectorDB interface.
 *
 * @typeParam TMetadata - Shape of the metadata object for type-safe operations.
 */
export interface VectorDB<TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  /** Add a single document */
  add(doc: Document<TMetadata>): Promise<void>;

  /** Add multiple documents with optional progress tracking */
  addMany(docs: Document<TMetadata>[], options?: AddManyOptions): Promise<void>;

  /** Search for similar vectors */
  search(vector: Float32Array, options?: SearchOptions<TMetadata>): Promise<SearchResult<TMetadata>[]>;

  /** Get a document by ID */
  get(id: string): Promise<(Document<TMetadata> & { metadata?: TMetadata }) | null>;

  /** Update a document's vector or metadata */
  update(id: string, updates: Partial<Omit<Document<TMetadata>, 'id'>>): Promise<void>;

  /** Delete a document by ID */
  delete(id: string): Promise<void>;

  /** Delete multiple documents by ID */
  deleteMany(ids: string[]): Promise<void>;

  /** Delete documents matching a filter */
  deleteWhere(filter: TypedFilterQuery<TMetadata>): Promise<number>;

  /** Get a namespaced collection */
  collection(name: string): VectorDB<TMetadata>;

  /** Get database statistics */
  stats(): Promise<DBStats>;

  /** Clear all data in the database */
  clear(): Promise<void>;

  /** Close the database connection */
  close(): Promise<void>;

  /** Export database data */
  export(options?: ExportOptions): Promise<Blob>;

  /** Import database data */
  import(data: Blob, options?: ImportOptions): Promise<void>;

  /** Recalibrate quantization from current vectors and re-quantize all stored vectors */
  recalibrate(options?: RecalibrateOptions): Promise<void>;

  /** Get the lock manager (for advanced usage) */
  getLockManager(): unknown;

  /** Get the broadcaster (for advanced usage) */
  getBroadcaster(): unknown;
}

/**
 * Message types for worker communication.
 */
export type WorkerMessageType =
  | 'init'
  | 'add'
  | 'addMany'
  | 'search'
  | 'get'
  | 'update'
  | 'delete'
  | 'deleteMany'
  | 'deleteWhere'
  | 'stats'
  | 'clear'
  | 'close'
  | 'export'
  | 'import';

/**
 * Worker request message structure.
 */
export interface WorkerRequest {
  id: number;
  type: WorkerMessageType;
  payload: unknown;
  collectionId?: string;
}

/**
 * Worker response message structure.
 */
export interface WorkerResponse {
  id: number;
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * HNSW node in the graph.
 */
export interface HNSWNode {
  id: string;
  level: number;
  connections: Map<number, string[]>; // level -> connected node IDs
}

/**
 * Serialized HNSW index format.
 */
export interface SerializedHNSWIndex {
  version: number;
  dimensions: number;
  m: number;
  efConstruction: number;
  entryPointId: string | null;
  maxLevel: number;
  nodes: Array<{
    id: string;
    level: number;
    connections: Array<[number, string[]]>;
  }>;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG = {
  storage: 'indexeddb' as const,
  indexOptions: {
    m: 16,
    efConstruction: 200,
    efSearch: 50,
    distanceFunction: 'cosine' as const,
  },
  sync: {
    enableLocking: true,
    enableBroadcast: true,
    enableWAL: false,
  },
  encryption: {
    enabled: false,
    iterations: 100000,
  },
} as const;

/**
 * Default collection name.
 */
export const DEFAULT_COLLECTION = 'default';
