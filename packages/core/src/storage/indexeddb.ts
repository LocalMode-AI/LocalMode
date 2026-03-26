/**
 * IndexedDB storage adapter.
 */

import type { StoredDocument, StoredVector, Collection, SerializedHNSWIndex } from '../types.js';
import {
  STORE_NAMES,
  type DocumentRecord,
  type VectorRecord,
  type IndexRecord,
  type CollectionRecord,
} from './schema.js';
import { runMigrations, getCurrentVersion } from './migrations.js';
import { WAL, WAL_STORE_NAME, createReplayExecutor } from './wal.js';

export class IndexedDBStorage {
  private db: IDBDatabase | null = null;
  private dbName: string;
  private wal: WAL | null = null;
  private walEnabled: boolean;

  constructor(name: string, options: { enableWAL?: boolean } = {}) {
    this.dbName = `vectordb_${name}`;
    this.walEnabled = options.enableWAL ?? false;
  }

  /**
   * Open the database connection.
   */
  async open(): Promise<void> {
    if (this.db) return;

    const currentVersion = getCurrentVersion();

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, currentVersion);

      request.onerror = () => {
        reject(new Error(`Failed to open database: ${request.error?.message}`));
      };

      request.onsuccess = async () => {
        this.db = request.result;

        // Initialize WAL if enabled
        if (this.walEnabled && this.db.objectStoreNames.contains(WAL_STORE_NAME)) {
          this.wal = new WAL(this.db);
          const pendingCount = await this.wal.initialize();

          // Replay pending operations if any
          if (pendingCount > 0) {
            console.log(`Replaying ${pendingCount} pending WAL operations...`);
            const executor = createReplayExecutor(
              this as unknown as Parameters<typeof createReplayExecutor>[0]
            );
            const replayed = await this.wal.replay(executor);
            console.log(`Replayed ${replayed} WAL operations`);
          }
        }

        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = (event.target as IDBOpenDBRequest).transaction!;
        const oldVersion = event.oldVersion;
        const newVersion = event.newVersion ?? currentVersion;

        runMigrations(db, transaction, oldVersion, newVersion);
      };

      request.onblocked = () => {
        console.warn('Database upgrade blocked. Close other tabs using this database.');
      };
    });
  }

  /**
   * Get the WAL instance (if enabled).
   */
  getWAL(): WAL | null {
    return this.wal;
  }

  /**
   * Close the database connection.
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Ensure the database is open.
   */
  private ensureOpen(): IDBDatabase {
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
    const record: DocumentRecord = {
      id: doc.id,
      collectionId: doc.collectionId,
      metadata: doc.metadata,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.DOCUMENTS, 'readwrite');
      const store = tx.objectStore(STORE_NAMES.DOCUMENTS);
      const request = store.put(record);

      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
    });
  }

  async getDocument(id: string): Promise<StoredDocument | null> {
    const db = this.ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.DOCUMENTS, 'readonly');
      const store = tx.objectStore(STORE_NAMES.DOCUMENTS);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const record = request.result as DocumentRecord | undefined;
        if (!record) {
          resolve(null);
          return;
        }
        resolve({
          id: record.id,
          collectionId: record.collectionId,
          metadata: record.metadata,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        });
      };
    });
  }

  async deleteDocument(id: string): Promise<void> {
    const db = this.ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.DOCUMENTS, 'readwrite');
      const store = tx.objectStore(STORE_NAMES.DOCUMENTS);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
    });
  }

  async getAllDocuments(collectionId: string): Promise<StoredDocument[]> {
    const db = this.ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.DOCUMENTS, 'readonly');
      const store = tx.objectStore(STORE_NAMES.DOCUMENTS);
      const index = store.index('collectionId');
      const request = index.getAll(collectionId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const records = request.result as DocumentRecord[];
        resolve(
          records.map((r) => ({
            id: r.id,
            collectionId: r.collectionId,
            metadata: r.metadata,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          }))
        );
      };
    });
  }

  async countDocuments(collectionId: string): Promise<number> {
    const db = this.ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.DOCUMENTS, 'readonly');
      const store = tx.objectStore(STORE_NAMES.DOCUMENTS);
      const index = store.index('collectionId');
      const request = index.count(collectionId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  // ============================================
  // Vector Operations
  // ============================================

  async addVector(vec: StoredVector): Promise<void> {
    const db = this.ensureOpen();
    const record: VectorRecord = {
      id: vec.id,
      collectionId: vec.collectionId,
      vector: vec.vector,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.VECTORS, 'readwrite');
      const store = tx.objectStore(STORE_NAMES.VECTORS);
      const request = store.put(record);

      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
    });
  }

  async getVector(id: string): Promise<Float32Array | Uint8Array | null> {
    const db = this.ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.VECTORS, 'readonly');
      const store = tx.objectStore(STORE_NAMES.VECTORS);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const record = request.result as VectorRecord | undefined;
        resolve(record?.vector ?? null);
      };
    });
  }

  async deleteVector(id: string): Promise<void> {
    const db = this.ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.VECTORS, 'readwrite');
      const store = tx.objectStore(STORE_NAMES.VECTORS);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
    });
  }

  async getAllVectors(collectionId: string): Promise<Map<string, Float32Array | Uint8Array>> {
    const db = this.ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.VECTORS, 'readonly');
      const store = tx.objectStore(STORE_NAMES.VECTORS);
      const index = store.index('collectionId');
      const request = index.getAll(collectionId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const records = request.result as VectorRecord[];
        const map = new Map<string, Float32Array | Uint8Array>();
        for (const r of records) {
          map.set(r.id, r.vector);
        }
        resolve(map);
      };
    });
  }

  // ============================================
  // Index Operations
  // ============================================

  async saveIndex(collectionId: string, index: SerializedHNSWIndex): Promise<void> {
    const db = this.ensureOpen();
    const record: IndexRecord = {
      collectionId,
      data: JSON.stringify(index),
      updatedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.INDEXES, 'readwrite');
      const store = tx.objectStore(STORE_NAMES.INDEXES);
      const request = store.put(record);

      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
    });
  }

  async loadIndex(collectionId: string): Promise<SerializedHNSWIndex | null> {
    const db = this.ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.INDEXES, 'readonly');
      const store = tx.objectStore(STORE_NAMES.INDEXES);
      const request = store.get(collectionId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const record = request.result as IndexRecord | undefined;
        if (!record) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(record.data) as SerializedHNSWIndex);
        } catch {
          resolve(null);
        }
      };
    });
  }

  async deleteIndex(collectionId: string): Promise<void> {
    const db = this.ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.INDEXES, 'readwrite');
      const store = tx.objectStore(STORE_NAMES.INDEXES);
      const request = store.delete(collectionId);

      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
    });
  }

  // ============================================
  // Collection Operations
  // ============================================

  /**
   * Convert a CollectionRecord to a Collection, deserializing calibration data.
   */
  private collectionFromRecord(record: CollectionRecord): Collection {
    const collection: Collection = {
      id: record.id,
      name: record.name,
      dimensions: record.dimensions,
      createdAt: record.createdAt,
    };

    if (record.calibration) {
      collection.calibration = {
        min: new Float32Array(record.calibration.min),
        max: new Float32Array(record.calibration.max),
      };
    }

    if (record.modelFingerprint) {
      collection.modelFingerprint = { ...record.modelFingerprint };
    }

    // Deserialize compression calibration
    if (record.compressionCalibration) {
      collection.compressionCalibration = {
        min: new Float32Array(record.compressionCalibration.min),
        max: new Float32Array(record.compressionCalibration.max),
      };
    }

    // Deserialize delta calibration
    if (record.deltaCalibration) {
      collection.deltaCalibration = {
        min: new Float32Array(record.deltaCalibration.min),
        max: new Float32Array(record.deltaCalibration.max),
      };
    }

    // Deserialize compression config
    if (record.compression) {
      collection.compression = { ...record.compression };
    }

    // Deserialize PQ codebook: number[][][] -> Float32Array[][]
    if (record.pqCodebook) {
      const { subvectors, centroids, subvectorDim, data } = record.pqCodebook;
      const codebook: Float32Array[][] = new Array(subvectors);
      for (let p = 0; p < subvectors; p++) {
        codebook[p] = new Array(centroids);
        for (let c = 0; c < centroids; c++) {
          codebook[p][c] = new Float32Array(data[p][c]);
        }
      }
      collection.pqCodebook = { subvectors, centroids, subvectorDim, codebook };
    }

    return collection;
  }

  async createCollection(collection: Collection): Promise<void> {
    const db = this.ensureOpen();
    const record: CollectionRecord = {
      id: collection.id,
      name: collection.name,
      dimensions: collection.dimensions,
      createdAt: collection.createdAt,
    };

    // Serialize calibration data if present
    if (collection.calibration) {
      record.calibration = {
        min: Array.from(collection.calibration.min),
        max: Array.from(collection.calibration.max),
      };
    }

    // Serialize model fingerprint if present
    if (collection.modelFingerprint) {
      record.modelFingerprint = { ...collection.modelFingerprint };
    }

    // Serialize PQ codebook: Float32Array[][] -> number[][][]
    if (collection.pqCodebook) {
      const { subvectors, centroids, subvectorDim, codebook } = collection.pqCodebook;
      const data: number[][][] = new Array(subvectors);
      for (let p = 0; p < subvectors; p++) {
        data[p] = new Array(centroids);
        for (let c = 0; c < centroids; c++) {
          data[p][c] = Array.from(codebook[p][c]);
        }
      }
      record.pqCodebook = { subvectors, centroids, subvectorDim, data };
    }

    // Serialize compression calibration if present
    if (collection.compressionCalibration) {
      record.compressionCalibration = {
        min: Array.from(collection.compressionCalibration.min),
        max: Array.from(collection.compressionCalibration.max),
      };
    }

    // Serialize delta calibration if present
    if (collection.deltaCalibration) {
      record.deltaCalibration = {
        min: Array.from(collection.deltaCalibration.min),
        max: Array.from(collection.deltaCalibration.max),
      };
    }

    // Serialize compression config if present
    if (collection.compression) {
      record.compression = { ...collection.compression };
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.COLLECTIONS, 'readwrite');
      const store = tx.objectStore(STORE_NAMES.COLLECTIONS);
      const request = store.put(record);

      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
    });
  }

  async getCollection(id: string): Promise<Collection | null> {
    const db = this.ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.COLLECTIONS, 'readonly');
      const store = tx.objectStore(STORE_NAMES.COLLECTIONS);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const record = request.result as CollectionRecord | undefined;
        if (!record) {
          resolve(null);
          return;
        }
        resolve(this.collectionFromRecord(record));
      };
    });
  }

  async getCollectionByName(name: string): Promise<Collection | null> {
    const db = this.ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.COLLECTIONS, 'readonly');
      const store = tx.objectStore(STORE_NAMES.COLLECTIONS);
      const index = store.index('name');
      const request = index.get(name);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const record = request.result as CollectionRecord | undefined;
        if (!record) {
          resolve(null);
          return;
        }
        resolve(this.collectionFromRecord(record));
      };
    });
  }

  async getAllCollections(): Promise<Collection[]> {
    const db = this.ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.COLLECTIONS, 'readonly');
      const store = tx.objectStore(STORE_NAMES.COLLECTIONS);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const records = request.result as CollectionRecord[];
        resolve(records.map((r) => this.collectionFromRecord(r)));
      };
    });
  }

  async updateCollection(collection: Collection): Promise<void> {
    const db = this.ensureOpen();
    const record: CollectionRecord = {
      id: collection.id,
      name: collection.name,
      dimensions: collection.dimensions,
      createdAt: collection.createdAt,
    };

    // Serialize calibration data (Float32Array -> number[]) for IndexedDB storage
    if (collection.calibration) {
      record.calibration = {
        min: Array.from(collection.calibration.min),
        max: Array.from(collection.calibration.max),
      };
    }

    // Serialize model fingerprint if present
    if (collection.modelFingerprint) {
      record.modelFingerprint = { ...collection.modelFingerprint };
    }

    // Serialize PQ codebook: Float32Array[][] -> number[][][]
    if (collection.pqCodebook) {
      const { subvectors, centroids, subvectorDim, codebook } = collection.pqCodebook;
      const data: number[][][] = new Array(subvectors);
      for (let p = 0; p < subvectors; p++) {
        data[p] = new Array(centroids);
        for (let c = 0; c < centroids; c++) {
          data[p][c] = Array.from(codebook[p][c]);
        }
      }
      record.pqCodebook = { subvectors, centroids, subvectorDim, data };
    }

    // Serialize compression calibration if present
    if (collection.compressionCalibration) {
      record.compressionCalibration = {
        min: Array.from(collection.compressionCalibration.min),
        max: Array.from(collection.compressionCalibration.max),
      };
    }

    // Serialize delta calibration if present
    if (collection.deltaCalibration) {
      record.deltaCalibration = {
        min: Array.from(collection.deltaCalibration.min),
        max: Array.from(collection.deltaCalibration.max),
      };
    }

    // Serialize compression config if present
    if (collection.compression) {
      record.compression = { ...collection.compression };
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.COLLECTIONS, 'readwrite');
      const store = tx.objectStore(STORE_NAMES.COLLECTIONS);
      const request = store.put(record);

      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
    });
  }

  async deleteCollection(id: string): Promise<void> {
    const db = this.ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.COLLECTIONS, 'readwrite');
      const store = tx.objectStore(STORE_NAMES.COLLECTIONS);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
    });
  }

  // ============================================
  // Utility Operations
  // ============================================

  async clear(): Promise<void> {
    const db = this.ensureOpen();

    const storeNames = [
      STORE_NAMES.DOCUMENTS,
      STORE_NAMES.VECTORS,
      STORE_NAMES.INDEXES,
      STORE_NAMES.COLLECTIONS,
    ];

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames, 'readwrite');

      for (const name of storeNames) {
        tx.objectStore(name).clear();
      }

      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve();
    });
  }

  async clearCollection(collectionId: string): Promise<void> {
    const db = this.ensureOpen();

    // Get all document IDs for this collection
    const docs = await this.getAllDocuments(collectionId);
    const ids = docs.map((d) => d.id);

    // Delete documents and vectors
    const tx = db.transaction([STORE_NAMES.DOCUMENTS, STORE_NAMES.VECTORS], 'readwrite');
    const docStore = tx.objectStore(STORE_NAMES.DOCUMENTS);
    const vecStore = tx.objectStore(STORE_NAMES.VECTORS);

    for (const id of ids) {
      docStore.delete(id);
      vecStore.delete(id);
    }

    await new Promise<void>((resolve, reject) => {
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve();
    });

    // Delete the index
    await this.deleteIndex(collectionId);
  }

  /**
   * Estimate storage size in bytes.
   */
  async estimateSize(): Promise<number> {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      return estimate.usage ?? 0;
    }
    return 0;
  }

  // ============================================
  // Meta Operations (Key-Value Store)
  // ============================================

  /**
   * Get a value from the meta store.
   */
  async getMeta(key: string): Promise<unknown> {
    const db = this.ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.META, 'readonly');
      const store = tx.objectStore(STORE_NAMES.META);
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const record = request.result as { key: string; value: unknown } | undefined;
        resolve(record?.value ?? null);
      };
    });
  }

  /**
   * Set a value in the meta store.
   */
  async setMeta(key: string, value: unknown): Promise<void> {
    const db = this.ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.META, 'readwrite');
      const store = tx.objectStore(STORE_NAMES.META);
      const request = store.put({ key, value });

      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
    });
  }

  /**
   * Delete a value from the meta store.
   */
  async deleteMeta(key: string): Promise<void> {
    const db = this.ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.META, 'readwrite');
      const store = tx.objectStore(STORE_NAMES.META);
      const request = store.delete(key);

      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
    });
  }
}
