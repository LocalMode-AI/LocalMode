/**
 * Dexie Storage Types
 *
 * Configuration types for the Dexie.js storage adapter.
 *
 * @packageDocumentation
 */

/**
 * Configuration options for DexieStorage.
 */
export interface DexieStorageOptions {
  /**
   * Database name.
   * Will be prefixed with 'vectordb_' internally.
   */
  name: string;

  /**
   * Database version for schema migrations.
   * Increment when schema changes.
   * @default 1
   */
  version?: number;

  /**
   * Enable auto-open on first operation.
   * @default true
   */
  autoOpen?: boolean;
}

/**
 * A stored document in the database.
 */
export interface StoredDocument {
  /** Unique identifier */
  id: string;

  /** Document metadata */
  metadata?: Record<string, unknown>;

  /** Timestamp when document was added */
  createdAt?: number;

  /** Timestamp when document was last updated */
  updatedAt?: number;
}

/**
 * A stored vector in the database.
 */
export interface StoredVector {
  /** Document ID this vector belongs to */
  id: string;

  /** The vector data */
  vector: Float32Array;

  /** Collection this vector belongs to */
  collection?: string;
}

/**
 * A serialized HNSW index.
 */
export interface SerializedHNSWIndex {
  /** Index identifier */
  id: string;

  /** Serialized index data */
  data: Uint8Array;

  /** Index metadata */
  metadata?: {
    dimensions: number;
    nodeCount: number;
    m: number;
    efConstruction: number;
  };
}

/**
 * Collection metadata.
 */
export interface Collection {
  /** Collection identifier */
  id: string;

  /** Collection name */
  name: string;

  /** Number of dimensions for vectors in this collection */
  dimensions: number;

  /** Distance metric used */
  distanceFunction: 'cosine' | 'euclidean' | 'dot';

  /** Creation timestamp */
  createdAt: number;

  /** Last update timestamp */
  updatedAt: number;

  /** Document count */
  documentCount: number;
}

