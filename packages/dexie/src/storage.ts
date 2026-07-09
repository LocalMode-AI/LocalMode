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
 * Internal Dexie record types.
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
 * Dexie database class with typed tables.
 */
class DexieDB extends Dexie {
  documents!: Table<DocumentRecord, string>;
  vectors!: Table<VectorRecord, string>;
  indexes!: Table<IndexRecord, string>;
  /**
   * Collection records are stored as the FULL {@link Collection} object —
   * including every optional extended field (`modelFingerprint`,
   * `calibration`, `pqCodebook`, `compression`, `compressionCalibration`,
   * `deltaCalibration`, and any future optional field). The schema below only
   * declares the indexed keys (`id`, unique `name`); Dexie persists all
   * remaining fields via structured clone.
   */
  collections!: Table<Collection, string>;

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
    // Copy to a standalone typed array (avoids persisting a view over a
    // larger shared buffer) while preserving the payload type — Uint8Array
    // for SQ8/PQ-compressed vectors, Float32Array otherwise.
    const copy = vec.vector instanceof Uint8Array
      ? new Uint8Array(vec.vector)
      : new Float32Array(vec.vector);

    await this.db.vectors.put({
      id: vec.id,
      collectionId: vec.collectionId,
      vector: copy,
    });
  }

  async getVector(id: string): Promise<Float32Array | Uint8Array | null> {
    const record = await this.db.vectors.get(id);
    if (!record) return null;

    return reviveVector(record.vector);
  }

  async deleteVector(id: string): Promise<void> {
    await this.db.vectors.delete(id);
  }

  async getAllVectors(collectionId: string): Promise<Map<string, Float32Array | Uint8Array>> {
    const records = await this.db.vectors
      .where('collectionId')
      .equals(collectionId)
      .toArray();

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

  // Collection records round-trip the FULL Collection object: writes spread
  // `{ ...collection }` (never a cherry-picked subset) and reads return the
  // stored record as-is, so the optional extended fields core persists on the
  // collection (quantization/compression calibration, PQ codebooks, model
  // fingerprint — and any future optional field) survive across sessions.
  // Dropping them silently corrupts quantized/compressed vectors on reopen
  // and disables drift detection.

  async createCollection(collection: Collection): Promise<void> {
    await this.db.collections.put({ ...collection });
  }

  async getCollection(id: string): Promise<Collection | null> {
    const record = await this.db.collections.get(id);
    return record ?? null;
  }

  async getCollectionByName(name: string): Promise<Collection | null> {
    const record = await this.db.collections.where('name').equals(name).first();
    return record ?? null;
  }

  async getAllCollections(): Promise<Collection[]> {
    return this.db.collections.toArray();
  }

  async updateCollection(collection: Collection): Promise<void> {
    await this.db.collections.put({ ...collection });
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
