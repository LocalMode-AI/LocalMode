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

  async getVector(id: string): Promise<Float32Array | null> {
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

  async getAllVectors(collectionId: string): Promise<Map<string, Float32Array>> {
    const db = this.ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.VECTORS, 'readonly');
      const store = tx.objectStore(STORE_NAMES.VECTORS);
      const index = store.index('collectionId');
      const request = index.getAll(collectionId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const records = request.result as VectorRecord[];
        const map = new Map<string, Float32Array>();
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

  async createCollection(collection: Collection): Promise<void> {
    const db = this.ensureOpen();
    const record: CollectionRecord = {
      id: collection.id,
      name: collection.name,
      dimensions: collection.dimensions,
      createdAt: collection.createdAt,
    };

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
        resolve({
          id: record.id,
          name: record.name,
          dimensions: record.dimensions,
          createdAt: record.createdAt,
        });
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
        resolve({
          id: record.id,
          name: record.name,
          dimensions: record.dimensions,
          createdAt: record.createdAt,
        });
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
        resolve(
          records.map((r) => ({
            id: r.id,
            name: r.name,
            dimensions: r.dimensions,
            createdAt: r.createdAt,
          }))
        );
      };
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
}
