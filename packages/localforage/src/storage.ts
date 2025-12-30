/**
 * LocalForage Storage Implementation
 *
 * Auto-fallback storage adapter using localforage.
 * Automatically uses the best available storage driver (IndexedDB, WebSQL, localStorage).
 *
 * @packageDocumentation
 */

import localforage from 'localforage';

/**
 * Configuration options for LocalForageStorage.
 */
export interface LocalForageStorageOptions {
  /**
   * Database name.
   */
  name: string;

  /**
   * Store name (optional).
   * @default 'keyvaluepairs'
   */
  storeName?: string;

  /**
   * Description for the database.
   */
  description?: string;

  /**
   * Preferred driver order.
   * @default [localforage.INDEXEDDB, localforage.WEBSQL, localforage.LOCALSTORAGE]
   */
  drivers?: string[];
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
 * Internal record format for documents.
 */
interface DocumentRecord {
  id: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/**
 * Internal record format for vectors.
 */
interface VectorRecord {
  id: string;
  vector: ArrayBuffer;
  collection?: string;
}

/**
 * Internal record format for indexes.
 */
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

/**
 * Cross-browser storage adapter using localforage.
 *
 * localforage provides automatic fallback from IndexedDB to WebSQL
 * to localStorage, ensuring maximum browser compatibility including
 * Safari Private Browsing mode.
 *
 * @example
 * ```ts
 * import { LocalForageStorage } from '@localmode/localforage';
 *
 * const storage = new LocalForageStorage({ name: 'my-app' });
 * await storage.ready();
 *
 * // Store data
 * await storage.setDocument('doc-1', { metadata: { title: 'Hello' } });
 * await storage.setVector('doc-1', new Float32Array([0.1, 0.2, 0.3]));
 *
 * // Retrieve data
 * const doc = await storage.getDocument('doc-1');
 * const vector = await storage.getVector('doc-1');
 * ```
 */
export class LocalForageStorage {
  private documents: LocalForage;
  private vectors: LocalForage;
  private indexes: LocalForage;
  private initialized = false;

  constructor(options: LocalForageStorageOptions) {
    const drivers = options.drivers ?? [
      localforage.INDEXEDDB,
      localforage.WEBSQL,
      localforage.LOCALSTORAGE,
    ];

    // Create separate instances for each store
    this.documents = localforage.createInstance({
      name: options.name,
      storeName: `${options.storeName ?? 'vectordb'}_documents`,
      description: options.description ?? 'LocalMode vector database documents',
      driver: drivers,
    });

    this.vectors = localforage.createInstance({
      name: options.name,
      storeName: `${options.storeName ?? 'vectordb'}_vectors`,
      description: options.description ?? 'LocalMode vector database vectors',
      driver: drivers,
    });

    this.indexes = localforage.createInstance({
      name: options.name,
      storeName: `${options.storeName ?? 'vectordb'}_indexes`,
      description: options.description ?? 'LocalMode vector database indexes',
      driver: drivers,
    });
  }

  /**
   * Wait for storage to be ready.
   */
  async ready(): Promise<void> {
    if (this.initialized) return;

    await Promise.all([this.documents.ready(), this.vectors.ready(), this.indexes.ready()]);
    this.initialized = true;
  }

  /**
   * Get the current driver name.
   */
  async getDriver(): Promise<string | null> {
    await this.ready();
    return this.documents.driver();
  }

  // ═══════════════════════════════════════════════════════════════
  // DOCUMENT OPERATIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get a document by ID.
   */
  async getDocument(id: string): Promise<StoredDocument | undefined> {
    await this.ready();
    const record = await this.documents.getItem<DocumentRecord>(`doc:${id}`);
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
    await this.ready();
    const now = Date.now();
    const existing = await this.documents.getItem<DocumentRecord>(`doc:${id}`);

    await this.documents.setItem<DocumentRecord>(`doc:${id}`, {
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
    await this.ready();
    await this.documents.removeItem(`doc:${id}`);
  }

  /**
   * Get all document IDs.
   */
  async getDocumentIds(): Promise<string[]> {
    await this.ready();
    const keys = await this.documents.keys();
    return keys.filter((k) => k.startsWith('doc:')).map((k) => k.slice(4));
  }

  /**
   * Clear all documents.
   */
  async clearDocuments(): Promise<void> {
    await this.ready();
    await this.documents.clear();
  }

  /**
   * Get document count.
   */
  async getDocumentCount(): Promise<number> {
    const ids = await this.getDocumentIds();
    return ids.length;
  }

  // ═══════════════════════════════════════════════════════════════
  // VECTOR OPERATIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get a vector by document ID.
   */
  async getVector(id: string): Promise<StoredVector | undefined> {
    await this.ready();
    const record = await this.vectors.getItem<VectorRecord>(`vec:${id}`);
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
    await this.ready();

    await this.vectors.setItem<VectorRecord>(`vec:${id}`, {
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
    await this.ready();
    await this.vectors.removeItem(`vec:${id}`);
  }

  /**
   * Get all vectors.
   */
  async getAllVectors(): Promise<StoredVector[]> {
    await this.ready();
    const vectors: StoredVector[] = [];

    await this.vectors.iterate<VectorRecord, void>((value, key) => {
      if (key.startsWith('vec:')) {
        vectors.push({
          id: value.id,
          vector: new Float32Array(value.vector),
          collection: value.collection,
        });
      }
    });

    return vectors;
  }

  /**
   * Clear all vectors.
   */
  async clearVectors(): Promise<void> {
    await this.ready();
    await this.vectors.clear();
  }

  // ═══════════════════════════════════════════════════════════════
  // INDEX OPERATIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get a serialized HNSW index.
   */
  async getIndex(id: string): Promise<SerializedHNSWIndex | undefined> {
    await this.ready();
    const record = await this.indexes.getItem<IndexRecord>(`idx:${id}`);
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
    await this.ready();

    await this.indexes.setItem<IndexRecord>(`idx:${id}`, {
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
    await this.ready();
    await this.indexes.removeItem(`idx:${id}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // BATCH OPERATIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Add multiple documents and vectors.
   */
  async addMany(
    items: Array<{
      id: string;
      vector: Float32Array;
      metadata?: Record<string, unknown>;
      collection?: string;
    }>
  ): Promise<void> {
    await this.ready();
    const now = Date.now();

    // localforage doesn't support true transactions, but we can parallelize
    await Promise.all(
      items.flatMap((item) => [
        this.documents.setItem<DocumentRecord>(`doc:${item.id}`, {
          id: item.id,
          metadata: item.metadata,
          createdAt: now,
          updatedAt: now,
        }),
        this.vectors.setItem<VectorRecord>(`vec:${item.id}`, {
          id: item.id,
          vector: item.vector.buffer.slice(
            item.vector.byteOffset,
            item.vector.byteOffset + item.vector.byteLength
          ) as ArrayBuffer,
          collection: item.collection,
        }),
      ])
    );
  }

  /**
   * Delete multiple documents and vectors.
   */
  async deleteMany(ids: string[]): Promise<void> {
    await this.ready();

    await Promise.all(
      ids.flatMap((id) => [
        this.documents.removeItem(`doc:${id}`),
        this.vectors.removeItem(`vec:${id}`),
      ])
    );
  }

  /**
   * Clear all data.
   */
  async clearAll(): Promise<void> {
    await this.ready();
    await Promise.all([this.documents.clear(), this.vectors.clear(), this.indexes.clear()]);
  }

  // ═══════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Drop the database entirely.
   * Note: localforage.dropInstance deletes all data in the database.
   */
  async drop(): Promise<void> {
    await Promise.all([
      this.documents.dropInstance(),
      this.vectors.dropInstance(),
      this.indexes.dropInstance(),
    ]);
    this.initialized = false;
  }

  /**
   * Check if using a fallback driver (not IndexedDB).
   */
  async isUsingFallback(): Promise<boolean> {
    const driver = await this.getDriver();
    return driver !== localforage.INDEXEDDB;
  }
}
