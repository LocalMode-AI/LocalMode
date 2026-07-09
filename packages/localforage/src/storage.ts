/**
 * LocalForage Storage Implementation
 *
 * Storage adapter using localforage for cross-browser compatibility.
 * Implements the {@link StorageAdapter} interface from `@localmode/core`.
 * Automatically falls back from IndexedDB to WebSQL to localStorage.
 *
 * @packageDocumentation
 */

import localforage from 'localforage';
import type {
  StorageAdapter,
  StoredDocument,
  StoredVector,
  Collection,
  SerializedHNSWIndex,
} from '@localmode/core';
import type { LocalForageStorageOptions } from './types.js';

/**
 * Internal vector record stored in localforage.
 * Uses a plain number array because localforage serializes values to JSON
 * when using the localStorage driver, and typed arrays do not survive
 * JSON round-tripping.
 */
interface VectorRecord {
  id: string;
  collectionId: string;
  vector: number[];
  /**
   * Payload type — 'u8' for SQ8/PQ-compressed vectors, 'f32' for float
   * vectors. Records written by older versions have no field and hold
   * f32 data.
   */
  dtype?: 'f32' | 'u8';
}

/**
 * Revive a stored record's vector preserving its payload type.
 */
function reviveVector(record: VectorRecord): Float32Array | Uint8Array {
  return record.dtype === 'u8'
    ? new Uint8Array(record.vector)
    : new Float32Array(record.vector);
}

/**
 * LocalForage storage adapter for VectorDB.
 *
 * Provides cross-browser storage with automatic driver fallback
 * (IndexedDB -> WebSQL -> localStorage), implementing the core
 * {@link StorageAdapter} interface for use with `createVectorDB()`.
 *
 * Uses four separate localforage instances to avoid key collisions
 * between documents, vectors, indexes, and collections.
 *
 * @example
 * ```typescript
 * import { LocalForageStorage } from '@localmode/localforage';
 * import { createVectorDB } from '@localmode/core';
 *
 * const storage = new LocalForageStorage({ name: 'my-app' });
 * const db = await createVectorDB({
 *   name: 'my-app',
 *   dimensions: 384,
 *   storage,
 * });
 * ```
 */
export class LocalForageStorage implements StorageAdapter {
  private docs: LocalForage;
  private vecs: LocalForage;
  private idxs: LocalForage;
  private cols: LocalForage;

  constructor(options: LocalForageStorageOptions) {
    const driverConfig = options.driver ? { driver: options.driver } : {};

    this.docs = localforage.createInstance({
      name: `${options.name}_documents`,
      ...driverConfig,
    });

    this.vecs = localforage.createInstance({
      name: `${options.name}_vectors`,
      ...driverConfig,
    });

    this.idxs = localforage.createInstance({
      name: `${options.name}_indexes`,
      ...driverConfig,
    });

    this.cols = localforage.createInstance({
      name: `${options.name}_collections`,
      ...driverConfig,
    });
  }

  // ============================================
  // Lifecycle
  // ============================================

  async open(): Promise<void> {
    await Promise.all([
      this.docs.ready(),
      this.vecs.ready(),
      this.idxs.ready(),
      this.cols.ready(),
    ]);
  }

  async close(): Promise<void> {
    // localforage has no explicit close — this is a no-op
  }

  // ============================================
  // Document Operations
  // ============================================

  async addDocument(doc: StoredDocument): Promise<void> {
    await this.docs.setItem<StoredDocument>(doc.id, {
      id: doc.id,
      collectionId: doc.collectionId,
      metadata: doc.metadata,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  }

  async getDocument(id: string): Promise<StoredDocument | null> {
    const record = await this.docs.getItem<StoredDocument>(id);
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
    await this.docs.removeItem(id);
  }

  async getAllDocuments(collectionId: string): Promise<StoredDocument[]> {
    const docs: StoredDocument[] = [];

    await this.docs.iterate<StoredDocument, void>((value) => {
      if (value.collectionId === collectionId) {
        docs.push({
          id: value.id,
          collectionId: value.collectionId,
          metadata: value.metadata,
          createdAt: value.createdAt,
          updatedAt: value.updatedAt,
        });
      }
    });

    return docs;
  }

  async countDocuments(collectionId: string): Promise<number> {
    let count = 0;

    await this.docs.iterate<StoredDocument, void>((value) => {
      if (value.collectionId === collectionId) {
        count++;
      }
    });

    return count;
  }

  // ============================================
  // Vector Operations
  // ============================================

  async addVector(vec: StoredVector): Promise<void> {
    await this.vecs.setItem<VectorRecord>(vec.id, {
      id: vec.id,
      collectionId: vec.collectionId,
      vector: Array.from(vec.vector),
      dtype: vec.vector instanceof Uint8Array ? 'u8' : 'f32',
    });
  }

  async getVector(id: string): Promise<Float32Array | Uint8Array | null> {
    const record = await this.vecs.getItem<VectorRecord>(id);
    if (!record) return null;

    return reviveVector(record);
  }

  async deleteVector(id: string): Promise<void> {
    await this.vecs.removeItem(id);
  }

  async getAllVectors(collectionId: string): Promise<Map<string, Float32Array | Uint8Array>> {
    const map = new Map<string, Float32Array | Uint8Array>();

    await this.vecs.iterate<VectorRecord, void>((value) => {
      if (value.collectionId === collectionId) {
        map.set(value.id, reviveVector(value));
      }
    });

    return map;
  }

  // ============================================
  // Index Operations
  // ============================================

  async saveIndex(collectionId: string, index: SerializedHNSWIndex): Promise<void> {
    await this.idxs.setItem(collectionId, JSON.stringify(index));
  }

  async loadIndex(collectionId: string): Promise<SerializedHNSWIndex | null> {
    const data = await this.idxs.getItem<string>(collectionId);
    if (!data) return null;

    try {
      return JSON.parse(data) as SerializedHNSWIndex;
    } catch {
      return null;
    }
  }

  async deleteIndex(collectionId: string): Promise<void> {
    await this.idxs.removeItem(collectionId);
  }

  // ============================================
  // Collection Operations
  // ============================================
  //
  // Collection records are persisted and returned in full — including the
  // optional extended fields (`modelFingerprint`, `calibration`, `pqCodebook`,
  // `compression`, `compressionCalibration`, `deltaCalibration`, and any
  // future optional field). Core stores quantization/compression calibration
  // and the embedding-model fingerprint ON the collection record; dropping
  // any of them silently corrupts quantized/compressed vectors on the next
  // session and disables drift detection.

  async createCollection(collection: Collection): Promise<void> {
    await this.cols.setItem<Collection>(collection.id, { ...collection });
  }

  async getCollection(id: string): Promise<Collection | null> {
    const record = await this.cols.getItem<Collection>(id);
    return record ?? null;
  }

  async getCollectionByName(name: string): Promise<Collection | null> {
    let found: Collection | null = null;

    await this.cols.iterate<Collection, void>((value) => {
      if (value.name === name) {
        found = value;
      }
    });

    return found;
  }

  async getAllCollections(): Promise<Collection[]> {
    const collections: Collection[] = [];

    await this.cols.iterate<Collection, void>((value) => {
      collections.push(value);
    });

    return collections;
  }

  async updateCollection(collection: Collection): Promise<void> {
    await this.cols.setItem<Collection>(collection.id, { ...collection });
  }

  async deleteCollection(id: string): Promise<void> {
    await this.cols.removeItem(id);
  }

  // ============================================
  // Utility Operations
  // ============================================

  async clear(): Promise<void> {
    await Promise.all([
      this.docs.clear(),
      this.vecs.clear(),
      this.idxs.clear(),
      this.cols.clear(),
    ]);
  }

  async clearCollection(collectionId: string): Promise<void> {
    // Collect document and vector IDs belonging to this collection
    const docIdsToDelete: string[] = [];
    const vecIdsToDelete: string[] = [];

    await this.docs.iterate<StoredDocument, void>((value, key) => {
      if (value.collectionId === collectionId) {
        docIdsToDelete.push(key);
      }
    });

    await this.vecs.iterate<VectorRecord, void>((value, key) => {
      if (value.collectionId === collectionId) {
        vecIdsToDelete.push(key);
      }
    });

    // Delete documents
    await Promise.all(docIdsToDelete.map((id) => this.docs.removeItem(id)));

    // Delete vectors
    await Promise.all(vecIdsToDelete.map((id) => this.vecs.removeItem(id)));

    // Delete index
    await this.idxs.removeItem(collectionId);
  }

  async estimateSize(): Promise<number> {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      return estimate.usage ?? 0;
    }
    return 0;
  }
}
