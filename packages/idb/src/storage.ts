/**
 * IDB Storage Implementation
 *
 * Minimal storage adapter using the idb library (~3KB).
 * Implements the {@link StorageAdapter} interface from `@localmode/core`.
 *
 * @packageDocumentation
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  StorageAdapter,
  StoredDocument,
  StoredVector,
  Collection,
  SerializedHNSWIndex,
} from '@localmode/core';
import type { IDBStorageOptions } from './types.js';

/**
 * Internal IDB record types (vector stored as ArrayBuffer for IndexedDB compatibility).
 */
interface DocumentRecord {
  id: string;
  collectionId: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

interface VectorRecord {
  id: string;
  collectionId: string;
  vector: ArrayBuffer;
}

interface IndexRecord {
  collectionId: string;
  data: string; // JSON serialized
  updatedAt: number;
}

interface CollectionRecord {
  id: string;
  name: string;
  dimensions: number;
  createdAt: number;
}

/**
 * Typed IDB database schema.
 */
interface VectorDBSchema extends DBSchema {
  documents: {
    key: string;
    value: DocumentRecord;
    indexes: { collectionId: string };
  };
  vectors: {
    key: string;
    value: VectorRecord;
    indexes: { collectionId: string };
  };
  indexes: {
    key: string;
    value: IndexRecord;
  };
  collections: {
    key: string;
    value: CollectionRecord;
    indexes: { name: string };
  };
}

/**
 * Minimal idb storage adapter for VectorDB.
 *
 * Provides lightweight IndexedDB storage using the idb library (~3KB),
 * implementing the core {@link StorageAdapter} interface for use with
 * `createVectorDB()`.
 *
 * @example
 * ```typescript
 * import { IDBStorage } from '@localmode/idb';
 * import { createVectorDB } from '@localmode/core';
 *
 * const storage = new IDBStorage({ name: 'my-app' });
 * const db = await createVectorDB({
 *   name: 'my-app',
 *   dimensions: 384,
 *   storage,
 * });
 * ```
 */
export class IDBStorage implements StorageAdapter {
  private db: IDBPDatabase<VectorDBSchema> | null = null;
  private readonly dbName: string;

  constructor(options: IDBStorageOptions) {
    this.dbName = options.name;
  }

  // ============================================
  // Lifecycle
  // ============================================

  async open(): Promise<void> {
    if (this.db) return;

    this.db = await openDB<VectorDBSchema>(this.dbName, 1, {
      upgrade(db) {
        // Documents store
        const docStore = db.createObjectStore('documents', { keyPath: 'id' });
        docStore.createIndex('collectionId', 'collectionId');

        // Vectors store
        const vecStore = db.createObjectStore('vectors', { keyPath: 'id' });
        vecStore.createIndex('collectionId', 'collectionId');

        // Indexes store (keyed by collectionId)
        db.createObjectStore('indexes', { keyPath: 'collectionId' });

        // Collections store
        const colStore = db.createObjectStore('collections', { keyPath: 'id' });
        colStore.createIndex('name', 'name', { unique: true });
      },
    });
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Ensure database is open, throwing if not.
   */
  private ensureOpen(): IDBPDatabase<VectorDBSchema> {
    if (!this.db) {
      throw new Error('Database not open. Call open() first.');
    }
    return this.db;
  }

  // ============================================
  // Document Operations
  // ============================================

  async addDocument(doc: StoredDocument): Promise<void> {
    const db = this.ensureOpen();
    await db.put('documents', {
      id: doc.id,
      collectionId: doc.collectionId,
      metadata: doc.metadata,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  }

  async getDocument(id: string): Promise<StoredDocument | null> {
    const db = this.ensureOpen();
    const record = await db.get('documents', id);
    if (!record) return null;

    return {
      id: record.id,
      collectionId: record.collectionId,
      metadata: record.metadata,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  async deleteDocument(id: string): Promise<void> {
    const db = this.ensureOpen();
    await db.delete('documents', id);
  }

  async getAllDocuments(collectionId: string): Promise<StoredDocument[]> {
    const db = this.ensureOpen();
    const records = await db.getAllFromIndex('documents', 'collectionId', collectionId);

    return records.map((r) => ({
      id: r.id,
      collectionId: r.collectionId,
      metadata: r.metadata,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async countDocuments(collectionId: string): Promise<number> {
    const db = this.ensureOpen();
    return db.countFromIndex('documents', 'collectionId', collectionId);
  }

  // ============================================
  // Vector Operations
  // ============================================

  async addVector(vec: StoredVector): Promise<void> {
    const db = this.ensureOpen();

    // Copy to standalone ArrayBuffer to avoid shared buffer issues
    const buffer = new ArrayBuffer(vec.vector.byteLength);
    new Float32Array(buffer).set(vec.vector);

    await db.put('vectors', {
      id: vec.id,
      collectionId: vec.collectionId,
      vector: buffer,
    });
  }

  async getVector(id: string): Promise<Float32Array | null> {
    const db = this.ensureOpen();
    const record = await db.get('vectors', id);
    if (!record) return null;

    return new Float32Array(record.vector);
  }

  async deleteVector(id: string): Promise<void> {
    const db = this.ensureOpen();
    await db.delete('vectors', id);
  }

  async getAllVectors(collectionId: string): Promise<Map<string, Float32Array>> {
    const db = this.ensureOpen();
    const records = await db.getAllFromIndex('vectors', 'collectionId', collectionId);

    const map = new Map<string, Float32Array>();
    for (const r of records) {
      map.set(r.id, new Float32Array(r.vector));
    }
    return map;
  }

  // ============================================
  // Index Operations
  // ============================================

  async saveIndex(collectionId: string, index: SerializedHNSWIndex): Promise<void> {
    const db = this.ensureOpen();
    await db.put('indexes', {
      collectionId,
      data: JSON.stringify(index),
      updatedAt: Date.now(),
    });
  }

  async loadIndex(collectionId: string): Promise<SerializedHNSWIndex | null> {
    const db = this.ensureOpen();
    const record = await db.get('indexes', collectionId);
    if (!record) return null;

    try {
      return JSON.parse(record.data) as SerializedHNSWIndex;
    } catch {
      return null;
    }
  }

  async deleteIndex(collectionId: string): Promise<void> {
    const db = this.ensureOpen();
    await db.delete('indexes', collectionId);
  }

  // ============================================
  // Collection Operations
  // ============================================

  async createCollection(collection: Collection): Promise<void> {
    const db = this.ensureOpen();
    await db.put('collections', {
      id: collection.id,
      name: collection.name,
      dimensions: collection.dimensions,
      createdAt: collection.createdAt,
    });
  }

  async getCollection(id: string): Promise<Collection | null> {
    const db = this.ensureOpen();
    const record = await db.get('collections', id);
    if (!record) return null;

    return {
      id: record.id,
      name: record.name,
      dimensions: record.dimensions,
      createdAt: record.createdAt,
    };
  }

  async getCollectionByName(name: string): Promise<Collection | null> {
    const db = this.ensureOpen();
    const record = await db.getFromIndex('collections', 'name', name);
    if (!record) return null;

    return {
      id: record.id,
      name: record.name,
      dimensions: record.dimensions,
      createdAt: record.createdAt,
    };
  }

  async getAllCollections(): Promise<Collection[]> {
    const db = this.ensureOpen();
    const records = await db.getAll('collections');
    return records.map((r) => ({
      id: r.id,
      name: r.name,
      dimensions: r.dimensions,
      createdAt: r.createdAt,
    }));
  }

  async updateCollection(collection: Collection): Promise<void> {
    const db = this.ensureOpen();
    await db.put('collections', {
      id: collection.id,
      name: collection.name,
      dimensions: collection.dimensions,
      createdAt: collection.createdAt,
    });
  }

  async deleteCollection(id: string): Promise<void> {
    const db = this.ensureOpen();
    await db.delete('collections', id);
  }

  // ============================================
  // Utility Operations
  // ============================================

  async clear(): Promise<void> {
    const db = this.ensureOpen();
    const tx = db.transaction(
      ['documents', 'vectors', 'indexes', 'collections'],
      'readwrite',
    );

    await Promise.all([
      tx.objectStore('documents').clear(),
      tx.objectStore('vectors').clear(),
      tx.objectStore('indexes').clear(),
      tx.objectStore('collections').clear(),
      tx.done,
    ]);
  }

  async clearCollection(collectionId: string): Promise<void> {
    const db = this.ensureOpen();

    // Get all document IDs in the collection
    const docs = await this.getAllDocuments(collectionId);
    const ids = docs.map((d) => d.id);

    // Delete documents and vectors in a transaction
    const tx = db.transaction(['documents', 'vectors'], 'readwrite');
    await Promise.all([
      ...ids.map((id) => tx.objectStore('documents').delete(id)),
      ...ids.map((id) => tx.objectStore('vectors').delete(id)),
      tx.done,
    ]);

    // Delete the index
    await this.deleteIndex(collectionId);
  }

  async estimateSize(): Promise<number> {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      return estimate.usage ?? 0;
    }
    return 0;
  }
}
