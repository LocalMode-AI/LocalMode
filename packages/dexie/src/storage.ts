/**
 * Dexie Storage Implementation
 *
 * Storage adapter using Dexie.js for enhanced IndexedDB experience.
 * Implements the {@link StorageAdapter} interface from `@localmode/core`.
 *
 * @packageDocumentation
 */

import Dexie, { type Table } from 'dexie';
import type {
  StorageAdapter,
  StoredDocument,
  StoredVector,
  Collection,
  SerializedHNSWIndex,
} from '@localmode/core';
import type { DexieStorageOptions } from './types.js';

/**
 * Internal Dexie record types (vector stored as ArrayBuffer for Dexie compatibility).
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
 * Dexie database class with typed tables.
 */
class DexieDB extends Dexie {
  documents!: Table<DocumentRecord, string>;
  vectors!: Table<VectorRecord, string>;
  indexes!: Table<IndexRecord, string>;
  collections!: Table<CollectionRecord, string>;

  constructor(name: string) {
    super(name);

    this.version(1).stores({
      documents: 'id, collectionId',
      vectors: 'id, collectionId',
      indexes: 'collectionId',
      collections: 'id, &name',
    });
  }
}

/**
 * Dexie.js storage adapter for VectorDB.
 *
 * Provides enhanced IndexedDB storage with Dexie.js, implementing the
 * core {@link StorageAdapter} interface for use with `createVectorDB()`.
 *
 * @example
 * ```typescript
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
export class DexieStorage implements StorageAdapter {
  private db: DexieDB;

  constructor(options: DexieStorageOptions) {
    this.db = new DexieDB(options.name);
  }

  // ============================================
  // Lifecycle
  // ============================================

  async open(): Promise<void> {
    if (!this.db.isOpen()) {
      await this.db.open();
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }

  // ============================================
  // Document Operations
  // ============================================

  async addDocument(doc: StoredDocument): Promise<void> {
    await this.db.documents.put({
      id: doc.id,
      collectionId: doc.collectionId,
      metadata: doc.metadata,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  }

  async getDocument(id: string): Promise<StoredDocument | null> {
    const record = await this.db.documents.get(id);
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
    await this.db.documents.delete(id);
  }

  async getAllDocuments(collectionId: string): Promise<StoredDocument[]> {
    const records = await this.db.documents
      .where('collectionId')
      .equals(collectionId)
      .toArray();

    return records.map((r) => ({
      id: r.id,
      collectionId: r.collectionId,
      metadata: r.metadata,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async countDocuments(collectionId: string): Promise<number> {
    return this.db.documents
      .where('collectionId')
      .equals(collectionId)
      .count();
  }

  // ============================================
  // Vector Operations
  // ============================================

  async addVector(vec: StoredVector): Promise<void> {
    // Copy to standalone ArrayBuffer to avoid shared buffer issues
    const buffer = new ArrayBuffer(vec.vector.byteLength);
    new Float32Array(buffer).set(vec.vector);

    await this.db.vectors.put({
      id: vec.id,
      collectionId: vec.collectionId,
      vector: buffer,
    });
  }

  async getVector(id: string): Promise<Float32Array | null> {
    const record = await this.db.vectors.get(id);
    if (!record) return null;

    return new Float32Array(record.vector);
  }

  async deleteVector(id: string): Promise<void> {
    await this.db.vectors.delete(id);
  }

  async getAllVectors(collectionId: string): Promise<Map<string, Float32Array>> {
    const records = await this.db.vectors
      .where('collectionId')
      .equals(collectionId)
      .toArray();

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
    await this.db.indexes.put({
      collectionId,
      data: JSON.stringify(index),
      updatedAt: Date.now(),
    });
  }

  async loadIndex(collectionId: string): Promise<SerializedHNSWIndex | null> {
    const record = await this.db.indexes.get(collectionId);
    if (!record) return null;

    try {
      return JSON.parse(record.data) as SerializedHNSWIndex;
    } catch {
      return null;
    }
  }

  async deleteIndex(collectionId: string): Promise<void> {
    await this.db.indexes.delete(collectionId);
  }

  // ============================================
  // Collection Operations
  // ============================================

  async createCollection(collection: Collection): Promise<void> {
    await this.db.collections.put({
      id: collection.id,
      name: collection.name,
      dimensions: collection.dimensions,
      createdAt: collection.createdAt,
    });
  }

  async getCollection(id: string): Promise<Collection | null> {
    const record = await this.db.collections.get(id);
    if (!record) return null;

    return {
      id: record.id,
      name: record.name,
      dimensions: record.dimensions,
      createdAt: record.createdAt,
    };
  }

  async getCollectionByName(name: string): Promise<Collection | null> {
    const record = await this.db.collections.where('name').equals(name).first();
    if (!record) return null;

    return {
      id: record.id,
      name: record.name,
      dimensions: record.dimensions,
      createdAt: record.createdAt,
    };
  }

  async getAllCollections(): Promise<Collection[]> {
    const records = await this.db.collections.toArray();
    return records.map((r) => ({
      id: r.id,
      name: r.name,
      dimensions: r.dimensions,
      createdAt: r.createdAt,
    }));
  }

  async updateCollection(collection: Collection): Promise<void> {
    await this.db.collections.put({
      id: collection.id,
      name: collection.name,
      dimensions: collection.dimensions,
      createdAt: collection.createdAt,
    });
  }

  async deleteCollection(id: string): Promise<void> {
    await this.db.collections.delete(id);
  }

  // ============================================
  // Utility Operations
  // ============================================

  async clear(): Promise<void> {
    await this.db.transaction(
      'rw',
      [this.db.documents, this.db.vectors, this.db.indexes, this.db.collections],
      async () => {
        await this.db.documents.clear();
        await this.db.vectors.clear();
        await this.db.indexes.clear();
        await this.db.collections.clear();
      },
    );
  }

  async clearCollection(collectionId: string): Promise<void> {
    const docs = await this.getAllDocuments(collectionId);
    const ids = docs.map((d) => d.id);

    await this.db.transaction('rw', [this.db.documents, this.db.vectors], async () => {
      await this.db.documents.bulkDelete(ids);
      await this.db.vectors.bulkDelete(ids);
    });

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
