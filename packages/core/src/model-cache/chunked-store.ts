/**
 * Chunked Model Store
 *
 * Manages an IndexedDB database with two object stores — `metadata` and `chunks` —
 * for persisting downloaded model files in fixed-size chunks.
 *
 * Handles IndexedDB unavailability (e.g. Safari Private Browsing) gracefully by
 * returning `null` / empty results instead of throwing.
 *
 * @packageDocumentation
 */

import type { ModelMetadataRecord } from './types.js';

// ============================================================================
// Constants
// ============================================================================

const DB_VERSION = 1;
const METADATA_STORE = 'metadata';
const CHUNKS_STORE = 'chunks';

// ============================================================================
// Chunk Key Helpers
// ============================================================================

/**
 * Build the compound key used to store a chunk.
 *
 * @param modelId - Model identifier
 * @param chunkIndex - Zero-based chunk index
 * @returns Compound key string
 */
function chunkKey(modelId: string, chunkIndex: number): string {
  return `${modelId}::${chunkIndex}`;
}

// ============================================================================
// ChunkedModelStore
// ============================================================================

/**
 * Low-level IndexedDB wrapper for chunked model storage.
 *
 * Each model is stored as:
 * - One {@link ModelMetadataRecord} in the `metadata` store (keyed by `modelId`)
 * - N ArrayBuffer entries in the `chunks` store (keyed by `"modelId::chunkIndex"`)
 */
export class ChunkedModelStore {
  private dbName: string;
  private db: IDBDatabase | null = null;

  /**
   * @param dbName - IndexedDB database name
   */
  constructor(dbName: string) {
    this.dbName = dbName;
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Open (or create) the IndexedDB database.
   *
   * @returns `true` if the database was opened successfully, `false` otherwise
   */
  async open(): Promise<boolean> {
    if (this.db) return true;

    if (typeof indexedDB === 'undefined') {
      return false;
    }

    try {
      this.db = await this.openWithRetry();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Close the IndexedDB connection.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // --------------------------------------------------------------------------
  // Chunk Operations
  // --------------------------------------------------------------------------

  /**
   * Write a single chunk to the store.
   *
   * @param modelId - Model identifier
   * @param chunkIndex - Zero-based chunk index
   * @param data - Raw chunk data
   */
  async writeChunk(modelId: string, chunkIndex: number, data: ArrayBuffer): Promise<void> {
    const db = this.db;
    if (!db) return;

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CHUNKS_STORE, 'readwrite');
      const store = tx.objectStore(CHUNKS_STORE);
      const key = chunkKey(modelId, chunkIndex);

      const request = store.put(data, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Read all chunks for a model as an async generator, yielding them in order.
   *
   * @param modelId - Model identifier
   * @yields ArrayBuffer for each chunk in index order
   */
  async *readChunks(modelId: string): AsyncGenerator<ArrayBuffer> {
    const db = this.db;
    if (!db) return;

    const meta = await this.readMetadata(modelId);
    if (!meta) return;

    for (let i = 0; i < meta.chunkCount; i++) {
      const chunk = await this.readSingleChunk(modelId, i);
      if (!chunk) return;
      yield chunk;
    }
  }

  /**
   * Reassemble all chunks for a model into a single Blob.
   *
   * @param modelId - Model identifier
   * @returns Blob containing the full model file, or `null` if not fully cached
   */
  async getBlob(modelId: string): Promise<Blob | null> {
    const db = this.db;
    if (!db) return null;

    const meta = await this.readMetadata(modelId);
    if (!meta || meta.status !== 'complete') return null;

    const parts: ArrayBuffer[] = [];
    for await (const chunk of this.readChunks(modelId)) {
      parts.push(chunk);
    }

    if (parts.length !== meta.chunkCount) return null;

    // Touch lastAccessed
    await this.updateLastAccessed(modelId);

    return new Blob(parts);
  }

  /**
   * Get the number of chunks currently stored for a model.
   *
   * @param modelId - Model identifier
   * @returns Number of stored chunks
   */
  async getChunkCount(modelId: string): Promise<number> {
    const db = this.db;
    if (!db) return 0;

    const meta = await this.readMetadata(modelId);
    if (!meta) return 0;

    let count = 0;
    for (let i = 0; i < meta.chunkCount; i++) {
      const exists = await this.chunkExists(modelId, i);
      if (exists) count++;
    }

    return count;
  }

  // --------------------------------------------------------------------------
  // Metadata Operations
  // --------------------------------------------------------------------------

  /**
   * Write or update a metadata record.
   *
   * @param record - Metadata to persist
   */
  async writeMetadata(record: ModelMetadataRecord): Promise<void> {
    const db = this.db;
    if (!db) return;

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(METADATA_STORE, 'readwrite');
      const store = tx.objectStore(METADATA_STORE);

      // Serialize dates to ISO strings for IndexedDB
      const serialized = {
        ...record,
        lastAccessed: record.lastAccessed.toISOString(),
        createdAt: record.createdAt.toISOString(),
      };

      const request = store.put(serialized, record.modelId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Read a metadata record.
   *
   * @param modelId - Model identifier
   * @returns Metadata record, or `null` if not found
   */
  async readMetadata(modelId: string): Promise<ModelMetadataRecord | null> {
    const db = this.db;
    if (!db) return null;

    return new Promise<ModelMetadataRecord | null>((resolve, reject) => {
      const tx = db.transaction(METADATA_STORE, 'readonly');
      const store = tx.objectStore(METADATA_STORE);
      const request = store.get(modelId);

      request.onsuccess = () => {
        const raw = request.result;
        if (!raw) {
          resolve(null);
          return;
        }
        resolve({
          ...raw,
          lastAccessed: new Date(raw.lastAccessed),
          createdAt: new Date(raw.createdAt),
        });
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update the `lastAccessed` timestamp for a model.
   *
   * @param modelId - Model identifier
   */
  async updateLastAccessed(modelId: string): Promise<void> {
    const meta = await this.readMetadata(modelId);
    if (!meta) return;

    meta.lastAccessed = new Date();
    await this.writeMetadata(meta);
  }

  /**
   * Get metadata for all cached models.
   *
   * @returns Array of all metadata records
   */
  async getAllMetadata(): Promise<ModelMetadataRecord[]> {
    const db = this.db;
    if (!db) return [];

    return new Promise<ModelMetadataRecord[]>((resolve, reject) => {
      const tx = db.transaction(METADATA_STORE, 'readonly');
      const store = tx.objectStore(METADATA_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = (request.result ?? []).map(
          (raw: Record<string, unknown>) => ({
            ...raw,
            lastAccessed: new Date(raw.lastAccessed as string),
            createdAt: new Date(raw.createdAt as string),
          })
        ) as ModelMetadataRecord[];
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // --------------------------------------------------------------------------
  // Delete Operations
  // --------------------------------------------------------------------------

  /**
   * Delete a model and all its chunks from the store.
   *
   * @param modelId - Model identifier
   */
  async deleteModel(modelId: string): Promise<void> {
    const db = this.db;
    if (!db) return;

    const meta = await this.readMetadata(modelId);

    // Delete all chunks
    if (meta) {
      const tx = db.transaction(CHUNKS_STORE, 'readwrite');
      const store = tx.objectStore(CHUNKS_STORE);

      for (let i = 0; i < meta.chunkCount; i++) {
        store.delete(chunkKey(modelId, i));
      }

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    // Delete metadata
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(METADATA_STORE, 'readwrite');
      const store = tx.objectStore(METADATA_STORE);
      const request = store.delete(modelId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  /**
   * Open the IndexedDB database, creating object stores on upgrade.
   */
  private openWithRetry(): Promise<IDBDatabase> {
    return new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;

      try {
        request = indexedDB.open(this.dbName, DB_VERSION);
      } catch (err) {
        reject(err);
        return;
      }

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          db.createObjectStore(METADATA_STORE);
        }

        if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
          db.createObjectStore(CHUNKS_STORE);
        }
      };

      request.onsuccess = () => resolve(request.result);

      request.onerror = () => reject(request.error);

      request.onblocked = () => {
        reject(new Error('IndexedDB open blocked — close other tabs using this database'));
      };
    });
  }

  /**
   * Read a single chunk by index.
   */
  private readSingleChunk(modelId: string, chunkIndex: number): Promise<ArrayBuffer | null> {
    const db = this.db;
    if (!db) return Promise.resolve(null);

    return new Promise<ArrayBuffer | null>((resolve, reject) => {
      const tx = db.transaction(CHUNKS_STORE, 'readonly');
      const store = tx.objectStore(CHUNKS_STORE);
      const request = store.get(chunkKey(modelId, chunkIndex));

      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Check whether a specific chunk exists.
   */
  private chunkExists(modelId: string, chunkIndex: number): Promise<boolean> {
    const db = this.db;
    if (!db) return Promise.resolve(false);

    return new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(CHUNKS_STORE, 'readonly');
      const store = tx.objectStore(CHUNKS_STORE);
      const request = store.count(chunkKey(modelId, chunkIndex));

      request.onsuccess = () => resolve(request.result > 0);
      request.onerror = () => reject(request.error);
    });
  }
}
