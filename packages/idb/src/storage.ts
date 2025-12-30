/**
 * IDB Storage Implementation
 *
 * Minimal storage adapter using the idb library.
 *
 * @packageDocumentation
 */

import { openDB, type IDBPDatabase } from 'idb';

/**
 * Configuration options for IDBStorage.
 */
export interface IDBStorageOptions {
  /**
   * Database name.
   */
  name: string;

  /**
   * Database version.
   * @default 1
   */
  version?: number;
}

/**
 * Stored document interface.
 */
export interface StoredDocument {
  id: string;
  metadata?: Record<string, unknown>;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Stored vector interface.
 */
export interface StoredVector {
  id: string;
  vector: Float32Array;
  collection?: string;
}

/**
 * Serialized HNSW index.
 */
export interface SerializedHNSWIndex {
  id: string;
  data: Uint8Array;
  metadata?: {
    dimensions: number;
    nodeCount: number;
    m: number;
    efConstruction: number;
  };
}

/**
 * Internal database schema.
 */
interface VectorDBSchema {
  documents: {
    key: string;
    value: {
      id: string;
      metadata?: Record<string, unknown>;
      createdAt: number;
      updatedAt: number;
    };
    indexes: { byUpdatedAt: number };
  };
  vectors: {
    key: string;
    value: {
      id: string;
      vector: ArrayBuffer;
      collection?: string;
    };
    indexes: { byCollection: string };
  };
  indexes: {
    key: string;
    value: {
      id: string;
      data: ArrayBuffer;
      metadata?: {
        dimensions: number;
        nodeCount: number;
        m: number;
        efConstruction: number;
      };
      updatedAt: number;
    };
  };
}

/**
 * Minimal IndexedDB storage adapter using the idb library.
 *
 * idb is a tiny (~3KB) Promise wrapper around IndexedDB that provides
 * a cleaner API while adding minimal overhead.
 *
 * @example
 * ```ts
 * import { IDBStorage } from '@localmode/idb';
 *
 * const storage = new IDBStorage({ name: 'my-app' });
 * await storage.open();
 *
 * // Store data
 * await storage.setDocument('doc-1', { metadata: { title: 'Hello' } });
 * await storage.setVector('doc-1', new Float32Array([0.1, 0.2, 0.3]));
 *
 * // Retrieve data
 * const doc = await storage.getDocument('doc-1');
 * const vector = await storage.getVector('doc-1');
 *
 * await storage.close();
 * ```
 */
export class IDBStorage {
  private db: IDBPDatabase<VectorDBSchema> | null = null;
  private dbName: string;
  private version: number;

  constructor(options: IDBStorageOptions) {
    this.dbName = `vectordb_${options.name}`;
    this.version = options.version ?? 1;
  }

  /**
   * Open the database connection.
   */
  async open(): Promise<void> {
    if (this.db) return;

    this.db = await openDB<VectorDBSchema>(this.dbName, this.version, {
      upgrade(db) {
        // Documents store
        if (!db.objectStoreNames.contains('documents')) {
          const docStore = db.createObjectStore('documents', { keyPath: 'id' });
          docStore.createIndex('byUpdatedAt', 'updatedAt');
        }

        // Vectors store
        if (!db.objectStoreNames.contains('vectors')) {
          const vecStore = db.createObjectStore('vectors', { keyPath: 'id' });
          vecStore.createIndex('byCollection', 'collection');
        }

        // Indexes store
        if (!db.objectStoreNames.contains('indexes')) {
          db.createObjectStore('indexes', { keyPath: 'id' });
        }
      },
    });
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
   * Ensure database is open.
   */
  private ensureOpen(): IDBPDatabase<VectorDBSchema> {
    if (!this.db) {
      throw new Error('Database not open. Call open() first.');
    }
    return this.db;
  }

  // ═══════════════════════════════════════════════════════════════
  // DOCUMENT OPERATIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get a document by ID.
   */
  async getDocument(id: string): Promise<StoredDocument | undefined> {
    const db = this.ensureOpen();
    const record = await db.get('documents', id);
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
    const db = this.ensureOpen();
    const now = Date.now();
    const existing = await db.get('documents', id);

    await db.put('documents', {
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
    const db = this.ensureOpen();
    await db.delete('documents', id);
  }

  /**
   * Get all document IDs.
   */
  async getDocumentIds(): Promise<string[]> {
    const db = this.ensureOpen();
    const keys = await db.getAllKeys('documents');
    return keys as string[];
  }

  /**
   * Clear all documents.
   */
  async clearDocuments(): Promise<void> {
    const db = this.ensureOpen();
    await db.clear('documents');
  }

  /**
   * Get document count.
   */
  async getDocumentCount(): Promise<number> {
    const db = this.ensureOpen();
    return db.count('documents');
  }

  // ═══════════════════════════════════════════════════════════════
  // VECTOR OPERATIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get a vector by document ID.
   */
  async getVector(id: string): Promise<StoredVector | undefined> {
    const db = this.ensureOpen();
    const record = await db.get('vectors', id);
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
    const db = this.ensureOpen();

    await db.put('vectors', {
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
    const db = this.ensureOpen();
    await db.delete('vectors', id);
  }

  /**
   * Get all vectors.
   */
  async getAllVectors(): Promise<StoredVector[]> {
    const db = this.ensureOpen();
    const records = await db.getAll('vectors');

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
    const db = this.ensureOpen();
    await db.clear('vectors');
  }

  // ═══════════════════════════════════════════════════════════════
  // INDEX OPERATIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get a serialized HNSW index.
   */
  async getIndex(id: string): Promise<SerializedHNSWIndex | undefined> {
    const db = this.ensureOpen();
    const record = await db.get('indexes', id);
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
    const db = this.ensureOpen();

    await db.put('indexes', {
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
    const db = this.ensureOpen();
    await db.delete('indexes', id);
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
    const db = this.ensureOpen();
    const now = Date.now();

    const tx = db.transaction(['documents', 'vectors'], 'readwrite');

    await Promise.all([
      ...items.map((item) =>
        tx.objectStore('documents').put({
          id: item.id,
          metadata: item.metadata,
          createdAt: now,
          updatedAt: now,
        })
      ),
      ...items.map((item) =>
        tx.objectStore('vectors').put({
          id: item.id,
          vector: item.vector.buffer.slice(
            item.vector.byteOffset,
            item.vector.byteOffset + item.vector.byteLength
          ) as ArrayBuffer,
          collection: item.collection,
        })
      ),
      tx.done,
    ]);
  }

  /**
   * Delete multiple documents and vectors.
   */
  async deleteMany(ids: string[]): Promise<void> {
    const db = this.ensureOpen();

    const tx = db.transaction(['documents', 'vectors'], 'readwrite');

    await Promise.all([
      ...ids.map((id) => tx.objectStore('documents').delete(id)),
      ...ids.map((id) => tx.objectStore('vectors').delete(id)),
      tx.done,
    ]);
  }

  /**
   * Clear all data.
   */
  async clearAll(): Promise<void> {
    const db = this.ensureOpen();

    const tx = db.transaction(['documents', 'vectors', 'indexes'], 'readwrite');

    await Promise.all([
      tx.objectStore('documents').clear(),
      tx.objectStore('vectors').clear(),
      tx.objectStore('indexes').clear(),
      tx.done,
    ]);
  }

  // ═══════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Delete the database entirely.
   */
  async delete(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }

    const { deleteDB } = await import('idb');
    await deleteDB(this.dbName);
  }

  /**
   * Get the database name.
   */
  get name(): string {
    return this.dbName;
  }
}
