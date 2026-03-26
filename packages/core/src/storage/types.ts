/**
 * Storage adapter interface.
 *
 * Defines the contract that all storage implementations must satisfy.
 * Built-in implementations: {@link IndexedDBStorage}, {@link MemoryStorage}.
 * External adapters (e.g., DexieStorage, IDBStorage, LocalForageStorage) implement
 * this interface to provide alternative storage backends for VectorDB.
 */

import type { StoredDocument, StoredVector, Collection, SerializedHNSWIndex } from '../types.js';

/**
 * Storage adapter interface for VectorDB backends.
 *
 * All storage implementations — built-in and external — share this contract.
 * External packages implement this interface and pass instances to
 * `createVectorDB({ storage: myAdapter })`.
 *
 * @example
 * ```typescript
 * import type { StorageAdapter } from '@localmode/core';
 *
 * class MyStorage implements StorageAdapter {
 *   // ... implement all methods
 * }
 *
 * const db = await createVectorDB({
 *   name: 'my-db',
 *   dimensions: 384,
 *   storage: new MyStorage(),
 * });
 * ```
 */
export interface StorageAdapter {
  // ============================================
  // Lifecycle
  // ============================================

  /** Open the storage connection. */
  open(): Promise<void>;

  /** Close the storage connection. */
  close(): Promise<void>;

  // ============================================
  // Document Operations
  // ============================================

  /** Add or update a document. */
  addDocument(doc: StoredDocument): Promise<void>;

  /** Get a document by ID. Returns `null` if not found. */
  getDocument(id: string): Promise<StoredDocument | null>;

  /** Delete a document by ID. */
  deleteDocument(id: string): Promise<void>;

  /** Get all documents in a collection. */
  getAllDocuments(collectionId: string): Promise<StoredDocument[]>;

  /** Count documents in a collection. */
  countDocuments(collectionId: string): Promise<number>;

  // ============================================
  // Vector Operations
  // ============================================

  /** Add or update a vector. */
  addVector(vec: StoredVector): Promise<void>;

  /** Get a vector by ID. Returns `null` if not found. */
  getVector(id: string): Promise<Float32Array | null>;

  /** Delete a vector by ID. */
  deleteVector(id: string): Promise<void>;

  /** Get all vectors in a collection as a Map of ID → Float32Array. */
  getAllVectors(collectionId: string): Promise<Map<string, Float32Array>>;

  // ============================================
  // Index Operations
  // ============================================

  /** Save a serialized HNSW index for a collection. */
  saveIndex(collectionId: string, index: SerializedHNSWIndex): Promise<void>;

  /** Load a serialized HNSW index for a collection. Returns `null` if not found. */
  loadIndex(collectionId: string): Promise<SerializedHNSWIndex | null>;

  /** Delete the HNSW index for a collection. */
  deleteIndex(collectionId: string): Promise<void>;

  // ============================================
  // Collection Operations
  // ============================================

  /** Create or update a collection. */
  createCollection(collection: Collection): Promise<void>;

  /** Get a collection by ID. Returns `null` if not found. */
  getCollection(id: string): Promise<Collection | null>;

  /** Get a collection by name. Returns `null` if not found. */
  getCollectionByName(name: string): Promise<Collection | null>;

  /** Get all collections. */
  getAllCollections(): Promise<Collection[]>;

  /** Update an existing collection. */
  updateCollection(collection: Collection): Promise<void>;

  /** Delete a collection by ID. */
  deleteCollection(id: string): Promise<void>;

  // ============================================
  // Utility Operations
  // ============================================

  /** Clear all data across all stores. */
  clear(): Promise<void>;

  /** Clear all data for a specific collection (documents, vectors, index). */
  clearCollection(collectionId: string): Promise<void>;

  /** Estimate total storage size in bytes. */
  estimateSize(): Promise<number>;
}
