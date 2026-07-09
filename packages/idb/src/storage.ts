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
 * Internal IDB record types.
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
  /**
   * The stored vector. Current versions store the typed array itself
   * (IndexedDB's structured clone preserves the type): `Float32Array` for
   * float vectors, `Uint8Array` for SQ8/PQ-compressed payloads. Records
   * written by older versions hold a raw `ArrayBuffer` of f32 data.
   */
  vector: Float32Array | Uint8Array | ArrayBuffer;
}

interface IndexRecord {
  collectionId: string;
  data: string; // JSON serialized
  updatedAt: number;
}

/**
 * Revive a stored vector preserving its payload type. Records written by
 * current versions hold the typed array itself (`Float32Array`, or
 * `Uint8Array` for SQ8/PQ-compressed payloads); records written by older
 * versions hold a raw `ArrayBuffer` of f32 data.
 *
 * Type detection uses the toString tag instead of `instanceof` because
 * structured clone can hand back typed arrays from another realm (e.g.
 * fake-indexeddb in tests), where `instanceof` fails. Views are re-wrapped
 * into same-realm typed arrays so downstream `instanceof` checks (core's
 * `decompressFromStorage`) see the expected types.
 */
function reviveVector(stored: Float32Array | Uint8Array | ArrayBuffer): Float32Array | Uint8Array {
  const tag = Object.prototype.toString.call(stored);
  if (tag === '[object Uint8Array]') {
    const view = stored as Uint8Array;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  if (tag === '[object Float32Array]') {
    const view = stored as Float32Array;
    return new Float32Array(view.buffer, view.byteOffset, view.length);
  }
  return new Float32Array(stored as ArrayBuffer);
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
    /**
     * The full core {@link Collection} object — including every optional
     * extended field (`modelFingerprint`, `calibration`, `pqCodebook`,
     * `compression`, `compressionCalibration`, `deltaCalibration`, and any
     * future ones). Core persists quantization/compression calibration and
     * the model fingerprint on the collection record; narrowing this shape
     * silently corrupts quantized/compressed vectors across sessions and
     * disables drift detection.
     */
    value: Collection;
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

    // Copy to a standalone typed array (avoids persisting a view over a
    // larger shared buffer) while preserving the payload type — Uint8Array
    // for SQ8/PQ-compressed vectors, Float32Array otherwise.
    const copy = vec.vector instanceof Uint8Array
      ? new Uint8Array(vec.vector)
      : new Float32Array(vec.vector);

    await db.put('vectors', {
      id: vec.id,
      collectionId: vec.collectionId,
      vector: copy,
    });
  }

  async getVector(id: string): Promise<Float32Array | Uint8Array | null> {
    const db = this.ensureOpen();
    const record = await db.get('vectors', id);
    if (!record) return null;

    return reviveVector(record.vector);
  }

  async deleteVector(id: string): Promise<void> {
    const db = this.ensureOpen();
    await db.delete('vectors', id);
  }

  async getAllVectors(collectionId: string): Promise<Map<string, Float32Array | Uint8Array>> {
    const db = this.ensureOpen();
    const records = await db.getAllFromIndex('vectors', 'collectionId', collectionId);

    const map = new Map<string, Float32Array | Uint8Array>();
    for (const r of records) {
      map.set(r.id, reviveVector(r.vector));
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
    // Persist the FULL Collection object (structured-clone-safe: the extended
    // fields are plain objects/arrays/typed arrays). Cherry-picking fields
    // would drop quantization/compression calibration and the model
    // fingerprint, corrupting compressed vectors on the next session.
    await db.put('collections', { ...collection });
  }

  async getCollection(id: string): Promise<Collection | null> {
    const db = this.ensureOpen();
    const record = await db.get('collections', id);
    if (!record) return null;

    // Return every stored field, including the optional extended ones.
    return { ...record };
  }

  async getCollectionByName(name: string): Promise<Collection | null> {
    const db = this.ensureOpen();
    const record = await db.getFromIndex('collections', 'name', name);
    if (!record) return null;

    return { ...record };
  }

  async getAllCollections(): Promise<Collection[]> {
    const db = this.ensureOpen();
    const records = await db.getAll('collections');
    return records.map((r) => ({ ...r }));
  }

  async updateCollection(collection: Collection): Promise<void> {
    const db = this.ensureOpen();
    // Core adds calibration/fingerprint data via updateCollection() after the
    // collection is created — the full object must round-trip here too.
    await db.put('collections', { ...collection });
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
