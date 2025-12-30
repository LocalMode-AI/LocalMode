/**
 * Dexie Storage Implementation
 *
 * Storage adapter using Dexie.js for enhanced IndexedDB experience.
 *
 * @packageDocumentation
 */

import Dexie, { type Table } from 'dexie';
import type {
  DexieStorageOptions,
  StoredDocument,
  StoredVector,
  SerializedHNSWIndex,
  Collection,
} from './types.js';

/**
 * Internal database schema types
 */
interface DocumentRecord {
  id: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

interface VectorRecord {
  id: string;
  vector: ArrayBuffer;
  collection?: string;
}

interface IndexRecord {
  id: string;
  data: ArrayBuffer;
  metadata?: {
    dimensions: number;
    nodeCount: number;
    m: number;
    efConstruction: number;
  };
  updatedAt: number;
}

interface CollectionRecord {
  id: string;
  name: string;
  dimensions: number;
  distanceFunction: 'cosine' | 'euclidean' | 'dot';
  createdAt: number;
  updatedAt: number;
  documentCount: number;
}

/**
 * Dexie database class with typed tables.
 */
class VectorDB extends Dexie {
  documents!: Table<DocumentRecord, string>;
  vectors!: Table<VectorRecord, string>;
  indexes!: Table<IndexRecord, string>;
  collections!: Table<CollectionRecord, string>;

  constructor(name: string, version: number = 1) {
    super(`vectordb_${name}`);

    this.version(version).stores({
      documents: 'id, createdAt, updatedAt',
      vectors: 'id, collection',
      indexes: 'id, updatedAt',
      collections: 'id, name, createdAt',
    });
  }
}

/**
 * Dexie.js storage adapter for VectorDB.
 *
 * Provides enhanced IndexedDB storage with:
 * - Schema versioning and migrations
 * - Transaction support
 * - Better query capabilities
 * - Developer-friendly API
 *
 * @example
 * ```ts
 * import { DexieStorage } from '@localmode/dexie';
 * import { createVectorDB } from '@localmode/core';
 *
 * const storage = new DexieStorage({ name: 'my-app' });
 * const db = await createVectorDB({
 *   name: 'my-app',
 *   dimensions: 384,
 *   storage,
 * });
 * ```
 */
export class DexieStorage {
  private db: VectorDB;
  private isOpen = false;

  constructor(options: DexieStorageOptions) {
    this.db = new VectorDB(options.name, options.version);

    if (options.autoOpen !== false) {
      // Auto-open is handled by Dexie on first operation
      this.isOpen = true;
    }
  }

  /**
   * Open the database connection explicitly.
   */
  async open(): Promise<void> {
    if (!this.isOpen) {
      await this.db.open();
      this.isOpen = true;
    }
  }

  /**
   * Close the database connection.
   */
  async close(): Promise<void> {
    this.db.close();
    this.isOpen = false;
  }

  // ═══════════════════════════════════════════════════════════════
  // DOCUMENT OPERATIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get a document by ID.
   */
  async getDocument(id: string): Promise<StoredDocument | undefined> {
    const record = await this.db.documents.get(id);
    if (!record) return undefined;

    return {
      id: record.id,
      metadata: record.metadata,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  /**
   * Set (upsert) a document.
   */
  async setDocument(id: string, doc: Omit<StoredDocument, 'id'>): Promise<void> {
    const now = Date.now();
    const existing = await this.db.documents.get(id);

    await this.db.documents.put({
      id,
      metadata: doc.metadata,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }

  /**
   * Delete a document by ID.
   */
  async deleteDocument(id: string): Promise<void> {
    await this.db.documents.delete(id);
  }

  /**
   * Get all document IDs.
   */
  async getDocumentIds(): Promise<string[]> {
    return this.db.documents.toCollection().primaryKeys();
  }

  /**
   * Clear all documents.
   */
  async clearDocuments(): Promise<void> {
    await this.db.documents.clear();
  }

  /**
   * Get document count.
   */
  async getDocumentCount(): Promise<number> {
    return this.db.documents.count();
  }

  // ═══════════════════════════════════════════════════════════════
  // VECTOR OPERATIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get a vector by document ID.
   */
  async getVector(id: string): Promise<StoredVector | undefined> {
    const record = await this.db.vectors.get(id);
    if (!record) return undefined;

    return {
      id: record.id,
      vector: new Float32Array(record.vector),
      collection: record.collection,
    };
  }

  /**
   * Set a vector for a document.
   */
  async setVector(id: string, vector: Float32Array, collection?: string): Promise<void> {
    await this.db.vectors.put({
      id,
      vector: vector.buffer.slice(
        vector.byteOffset,
        vector.byteOffset + vector.byteLength
      ) as ArrayBuffer,
      collection,
    });
  }

  /**
   * Delete a vector by document ID.
   */
  async deleteVector(id: string): Promise<void> {
    await this.db.vectors.delete(id);
  }

  /**
   * Get all vectors (optionally filtered by collection).
   */
  async getAllVectors(collection?: string): Promise<StoredVector[]> {
    let query = this.db.vectors.toCollection();

    if (collection) {
      query = this.db.vectors.where('collection').equals(collection);
    }

    const records = await query.toArray();

    return records.map((record) => ({
      id: record.id,
      vector: new Float32Array(record.vector),
      collection: record.collection,
    }));
  }

  /**
   * Clear all vectors.
   */
  async clearVectors(): Promise<void> {
    await this.db.vectors.clear();
  }

  // ═══════════════════════════════════════════════════════════════
  // INDEX OPERATIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get a serialized HNSW index.
   */
  async getIndex(id: string): Promise<SerializedHNSWIndex | undefined> {
    const record = await this.db.indexes.get(id);
    if (!record) return undefined;

    return {
      id: record.id,
      data: new Uint8Array(record.data),
      metadata: record.metadata,
    };
  }

  /**
   * Save a serialized HNSW index.
   */
  async setIndex(id: string, index: Omit<SerializedHNSWIndex, 'id'>): Promise<void> {
    await this.db.indexes.put({
      id,
      data: index.data.buffer.slice(
        index.data.byteOffset,
        index.data.byteOffset + index.data.byteLength
      ) as ArrayBuffer,
      metadata: index.metadata,
      updatedAt: Date.now(),
    });
  }

  /**
   * Delete an index.
   */
  async deleteIndex(id: string): Promise<void> {
    await this.db.indexes.delete(id);
  }

  // ═══════════════════════════════════════════════════════════════
  // COLLECTION OPERATIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get a collection by ID.
   */
  async getCollection(id: string): Promise<Collection | undefined> {
    const record = await this.db.collections.get(id);
    if (!record) return undefined;

    return { ...record };
  }

  /**
   * Create or update a collection.
   */
  async setCollection(id: string, collection: Omit<Collection, 'id'>): Promise<void> {
    await this.db.collections.put({
      id,
      ...collection,
    });
  }

  /**
   * Delete a collection.
   */
  async deleteCollection(id: string): Promise<void> {
    await this.db.collections.delete(id);
  }

  /**
   * Get all collections.
   */
  async getAllCollections(): Promise<Collection[]> {
    return this.db.collections.toArray();
  }

  // ═══════════════════════════════════════════════════════════════
  // BATCH OPERATIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Add multiple documents and vectors in a single transaction.
   */
  async addMany(
    items: Array<{
      id: string;
      vector: Float32Array;
      metadata?: Record<string, unknown>;
      collection?: string;
    }>
  ): Promise<void> {
    const now = Date.now();

    await this.db.transaction('rw', [this.db.documents, this.db.vectors], async () => {
      const docRecords = items.map((item) => ({
        id: item.id,
        metadata: item.metadata,
        createdAt: now,
        updatedAt: now,
      }));

      const vectorRecords: VectorRecord[] = items.map((item) => ({
        id: item.id,
        vector: item.vector.buffer.slice(
          item.vector.byteOffset,
          item.vector.byteOffset + item.vector.byteLength
        ) as ArrayBuffer,
        collection: item.collection,
      }));

      await this.db.documents.bulkPut(docRecords);
      await this.db.vectors.bulkPut(vectorRecords);
    });
  }

  /**
   * Delete multiple documents and vectors in a single transaction.
   */
  async deleteMany(ids: string[]): Promise<void> {
    await this.db.transaction('rw', [this.db.documents, this.db.vectors], async () => {
      await this.db.documents.bulkDelete(ids);
      await this.db.vectors.bulkDelete(ids);
    });
  }

  /**
   * Clear all data.
   */
  async clearAll(): Promise<void> {
    await this.db.transaction(
      'rw',
      [this.db.documents, this.db.vectors, this.db.indexes, this.db.collections],
      async () => {
        await this.db.documents.clear();
        await this.db.vectors.clear();
        await this.db.indexes.clear();
        await this.db.collections.clear();
      }
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Check if the database exists.
   */
  async exists(): Promise<boolean> {
    return Dexie.exists(this.db.name);
  }

  /**
   * Delete the database entirely.
   */
  async delete(): Promise<void> {
    await this.db.delete();
    this.isOpen = false;
  }

  /**
   * Get the database name.
   */
  get name(): string {
    return this.db.name;
  }

  /**
   * Get the current version.
   */
  get version(): number {
    return this.db.verno;
  }
}
