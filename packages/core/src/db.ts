/**
 * Main VectorDB implementation.
 */

import type {
  VectorDB,
  VectorDBConfig,
  Document,
  SearchOptions,
  SearchResult,
  AddManyOptions,
  ExportOptions,
  ImportOptions,
  DBStats,
  FilterQuery,
  StoredDocument,
} from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import { HNSWIndex } from './hnsw/index.js';
import { createStorage, type Storage } from './storage/index.js';
import { matchesFilter } from './query/filter.js';
import { LockManager } from './sync/locks.js';
import { Broadcaster } from './sync/broadcast.js';

/**
 * Internal VectorDB implementation.
 */
export class VectorDBImpl implements VectorDB {
  private storage: Storage;
  private index: HNSWIndex | null = null;
  private collectionId: string;
  private collectionName: string;
  private dimensions: number;
  private config: VectorDBConfig;
  private initialized = false;
  private lockManager: LockManager | null = null;
  private broadcaster: Broadcaster | null = null;

  constructor(config: VectorDBConfig, collectionName = 'default', existingStorage?: Storage) {
    this.config = config;
    this.dimensions = config.dimensions;
    this.collectionName = collectionName;
    this.collectionId = collectionName; // Use name as ID for simplicity
    this.storage = existingStorage ?? createStorage(config.storage ?? 'indexeddb', config.name);

    // Initialize sync features
    const syncConfig = { ...DEFAULT_CONFIG.sync, ...config.sync };
    if (syncConfig.enableLocking && config.storage !== 'memory') {
      this.lockManager = new LockManager(config.name);
    }
    if (syncConfig.enableBroadcast && config.storage !== 'memory') {
      this.broadcaster = new Broadcaster(config.name);
    }
  }

  /**
   * Initialize the database and load the index.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.storage.open();

    // Check if collection exists, create if not
    let collection = await this.storage.getCollectionByName(this.collectionName);
    if (!collection) {
      collection = {
        id: this.collectionId,
        name: this.collectionName,
        dimensions: this.dimensions,
        createdAt: Date.now(),
      };
      await this.storage.createCollection(collection);
    } else {
      this.collectionId = collection.id;
      // Validate dimensions match
      if (collection.dimensions !== this.dimensions) {
        throw new Error(
          `Dimension mismatch: expected ${this.dimensions}, stored collection has ${collection.dimensions}`
        );
      }
    }

    // Load or create index
    const savedIndex = await this.storage.loadIndex(this.collectionId);
    const vectors = await this.storage.getAllVectors(this.collectionId);

    if (savedIndex) {
      this.index = HNSWIndex.deserialize(savedIndex, vectors, this.config.indexOptions);
    } else {
      this.index = new HNSWIndex(this.dimensions, this.config.indexOptions);
      // Add any existing vectors to the index
      for (const [id, vector] of vectors) {
        this.index.add(id, vector);
      }
    }

    this.initialized = true;
  }

  /**
   * Ensure the database is initialized.
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Database not initialized. Call initialize() or use createVectorDB().');
    }
  }

  /**
   * Save the index to storage.
   */
  private async saveIndex(): Promise<void> {
    if (!this.index) return;
    const serialized = this.index.serialize();
    await this.storage.saveIndex(this.collectionId, serialized);
  }

  // ============================================
  // Public API
  // ============================================

  async add(doc: Document): Promise<void> {
    this.ensureInitialized();

    if (!doc.id) {
      throw new Error('Document must have an id');
    }

    if (!doc.vector || !(doc.vector instanceof Float32Array)) {
      throw new Error('Document must have a Float32Array vector');
    }

    if (doc.vector.length !== this.dimensions) {
      throw new Error(
        `Vector dimension mismatch: expected ${this.dimensions}, got ${doc.vector.length}`
      );
    }

    const operation = async (): Promise<void> => {
      const now = Date.now();

      // Store document metadata
      const storedDoc: StoredDocument = {
        id: doc.id,
        collectionId: this.collectionId,
        metadata: doc.metadata,
        createdAt: now,
        updatedAt: now,
      };
      await this.storage.addDocument(storedDoc);

      // Store vector
      await this.storage.addVector({
        id: doc.id,
        collectionId: this.collectionId,
        vector: doc.vector,
      });

      // Add to index
      this.index!.add(doc.id, doc.vector);

      // Save index periodically (could optimize with batching)
      await this.saveIndex();

      // Notify other tabs
      this.broadcaster?.notifyDocumentAdded(this.collectionId, doc.id);
    };

    // Use write lock if available
    if (this.lockManager) {
      await this.lockManager.withWriteLock(this.collectionId, operation);
    } else {
      await operation();
    }
  }

  async addMany(docs: Document[], options?: AddManyOptions): Promise<void> {
    this.ensureInitialized();

    const batchSize = options?.batchSize ?? 100;
    const total = docs.length;
    let completed = 0;

    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = docs.slice(i, i + batchSize);

      for (const doc of batch) {
        if (!doc.id) {
          throw new Error('All documents must have an id');
        }

        if (!doc.vector || !(doc.vector instanceof Float32Array)) {
          throw new Error('All documents must have a Float32Array vector');
        }

        if (doc.vector.length !== this.dimensions) {
          throw new Error(
            `Vector dimension mismatch: expected ${this.dimensions}, got ${doc.vector.length}`
          );
        }

        const now = Date.now();

        // Store document metadata
        await this.storage.addDocument({
          id: doc.id,
          collectionId: this.collectionId,
          metadata: doc.metadata,
          createdAt: now,
          updatedAt: now,
        });

        // Store vector
        await this.storage.addVector({
          id: doc.id,
          collectionId: this.collectionId,
          vector: doc.vector,
        });

        // Add to index
        this.index!.add(doc.id, doc.vector);
      }

      completed += batch.length;
      options?.onProgress?.(completed, total);
    }

    // Save index after all additions
    await this.saveIndex();
  }

  async search(vector: Float32Array, options?: SearchOptions): Promise<SearchResult[]> {
    this.ensureInitialized();

    if (vector.length !== this.dimensions) {
      throw new Error(
        `Query vector dimension mismatch: expected ${this.dimensions}, got ${vector.length}`
      );
    }

    const k = options?.k ?? 10;
    const threshold = options?.threshold;
    const filter = options?.filter;
    const includeVectors = options?.includeVectors ?? false;

    // If we have a filter, we need to search more candidates and filter
    const searchK = filter ? k * 10 : k;
    const rawResults = this.index!.search(vector, searchK);

    const results: SearchResult[] = [];

    for (const result of rawResults) {
      // Apply threshold
      if (threshold !== undefined && result.score < threshold) {
        continue;
      }

      // Get document metadata
      const doc = await this.storage.getDocument(result.id);
      if (!doc) continue;

      // Apply filter
      if (filter && !matchesFilter(doc.metadata, filter)) {
        continue;
      }

      const searchResult: SearchResult = {
        id: result.id,
        score: result.score,
        metadata: doc.metadata,
      };

      if (includeVectors) {
        searchResult.vector = (await this.storage.getVector(result.id)) ?? undefined;
      }

      results.push(searchResult);

      // Stop if we have enough results
      if (results.length >= k) {
        break;
      }
    }

    return results;
  }

  async get(id: string): Promise<(Document & { metadata?: Record<string, unknown> }) | null> {
    this.ensureInitialized();

    const doc = await this.storage.getDocument(id);
    if (!doc || doc.collectionId !== this.collectionId) {
      return null;
    }

    const vector = await this.storage.getVector(id);
    if (!vector) {
      return null;
    }

    return {
      id: doc.id,
      vector,
      metadata: doc.metadata,
    };
  }

  async update(id: string, updates: Partial<Omit<Document, 'id'>>): Promise<void> {
    this.ensureInitialized();

    const operation = async (): Promise<void> => {
      const existingDoc = await this.storage.getDocument(id);
      if (!existingDoc || existingDoc.collectionId !== this.collectionId) {
        throw new Error(`Document not found: ${id}`);
      }

      const now = Date.now();

      // Update metadata
      if (updates.metadata !== undefined) {
        await this.storage.addDocument({
          ...existingDoc,
          metadata: updates.metadata,
          updatedAt: now,
        });
      }

      // Update vector
      if (updates.vector !== undefined) {
        if (updates.vector.length !== this.dimensions) {
          throw new Error(
            `Vector dimension mismatch: expected ${this.dimensions}, got ${updates.vector.length}`
          );
        }

        await this.storage.addVector({
          id,
          collectionId: this.collectionId,
          vector: updates.vector,
        });

        // Update index
        this.index!.add(id, updates.vector);
        await this.saveIndex();
      }

      // Notify other tabs
      this.broadcaster?.notifyDocumentUpdated(this.collectionId, id);
    };

    if (this.lockManager) {
      await this.lockManager.withWriteLock(this.collectionId, operation);
    } else {
      await operation();
    }
  }

  async delete(id: string): Promise<void> {
    this.ensureInitialized();

    const operation = async (): Promise<void> => {
      await this.storage.deleteDocument(id);
      await this.storage.deleteVector(id);
      this.index!.delete(id);
      await this.saveIndex();

      // Notify other tabs
      this.broadcaster?.notifyDocumentDeleted(this.collectionId, id);
    };

    if (this.lockManager) {
      await this.lockManager.withWriteLock(this.collectionId, operation);
    } else {
      await operation();
    }
  }

  async deleteMany(ids: string[]): Promise<void> {
    this.ensureInitialized();

    for (const id of ids) {
      await this.storage.deleteDocument(id);
      await this.storage.deleteVector(id);
      this.index!.delete(id);
    }

    await this.saveIndex();
  }

  async deleteWhere(filter: FilterQuery): Promise<number> {
    this.ensureInitialized();

    const docs = await this.storage.getAllDocuments(this.collectionId);
    let deleted = 0;

    for (const doc of docs) {
      if (matchesFilter(doc.metadata, filter)) {
        await this.storage.deleteDocument(doc.id);
        await this.storage.deleteVector(doc.id);
        this.index!.delete(doc.id);
        deleted++;
      }
    }

    if (deleted > 0) {
      await this.saveIndex();
    }

    return deleted;
  }

  collection(name: string): VectorDB {
    // Create a new VectorDB instance for the collection
    const collectionDb = new VectorDBImpl(this.config, name, this.storage);
    // Note: The collection needs to be initialized before use
    // This is a sync method, so we return an uninitialized instance
    // The user should await operations which will trigger initialization
    return new Proxy(collectionDb as VectorDB, {
      get: (target, prop: string | symbol) => {
        const targetAny = target as unknown as Record<string | symbol, unknown>;
        const value = targetAny[prop];
        if (typeof value === 'function' && prop !== 'collection') {
          return async (...args: unknown[]) => {
            await collectionDb.initialize();
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        return value;
      },
    });
  }

  async stats(): Promise<DBStats> {
    this.ensureInitialized();

    const collections = await this.storage.getAllCollections();
    let totalCount = 0;

    for (const col of collections) {
      totalCount += await this.storage.countDocuments(col.id);
    }

    const sizeBytes = await this.storage.estimateSize();

    return {
      count: totalCount,
      collections: collections.map((c) => c.name),
      sizeBytes,
      version: 1,
    };
  }

  async clear(): Promise<void> {
    this.ensureInitialized();

    const operation = async (): Promise<void> => {
      await this.storage.clearCollection(this.collectionId);
      this.index = new HNSWIndex(this.dimensions, this.config.indexOptions);

      // Notify other tabs
      this.broadcaster?.notifyCollectionCleared(this.collectionId);
    };

    if (this.lockManager) {
      await this.lockManager.withWriteLock(this.collectionId, operation);
    } else {
      await operation();
    }
  }

  async close(): Promise<void> {
    if (this.index) {
      await this.saveIndex();
    }
    await this.storage.close();

    // Clean up sync resources
    this.broadcaster?.close();
    this.broadcaster = null;

    this.initialized = false;
  }

  /**
   * Get the lock manager (for advanced usage).
   */
  getLockManager(): LockManager | null {
    return this.lockManager;
  }

  /**
   * Get the broadcaster (for advanced usage).
   */
  getBroadcaster(): Broadcaster | null {
    return this.broadcaster;
  }

  async export(options?: ExportOptions): Promise<Blob> {
    this.ensureInitialized();

    const format = options?.format ?? 'json';
    const collections = options?.collections;
    const includeVectors = options?.includeVectors ?? true;

    const exportData: {
      version: number;
      collections: Array<{
        name: string;
        dimensions: number;
        documents: Array<{
          id: string;
          metadata?: Record<string, unknown>;
          vector?: number[];
        }>;
      }>;
    } = {
      version: 1,
      collections: [],
    };

    const allCollections = await this.storage.getAllCollections();
    const targetCollections = collections
      ? allCollections.filter((c) => collections.includes(c.name))
      : allCollections;

    for (const col of targetCollections) {
      const docs = await this.storage.getAllDocuments(col.id);
      const colData: (typeof exportData.collections)[0] = {
        name: col.name,
        dimensions: col.dimensions,
        documents: [],
      };

      for (const doc of docs) {
        const docData: (typeof colData.documents)[0] = {
          id: doc.id,
          metadata: doc.metadata,
        };

        if (includeVectors) {
          const vector = await this.storage.getVector(doc.id);
          if (vector) {
            docData.vector = Array.from(vector);
          }
        }

        colData.documents.push(docData);
      }

      exportData.collections.push(colData);
    }

    if (format === 'json') {
      return new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    } else {
      // Binary format (MessagePack or similar could be used here)
      // For now, just use JSON
      return new Blob([JSON.stringify(exportData)], { type: 'application/octet-stream' });
    }
  }

  async import(data: Blob, options?: ImportOptions): Promise<void> {
    this.ensureInitialized();

    const mode = options?.mode ?? 'merge';
    const text = await data.text();
    const importData = JSON.parse(text) as {
      version: number;
      collections: Array<{
        name: string;
        dimensions: number;
        documents: Array<{
          id: string;
          metadata?: Record<string, unknown>;
          vector?: number[];
        }>;
      }>;
    };

    if (mode === 'replace') {
      await this.storage.clear();
      this.index = new HNSWIndex(this.dimensions, this.config.indexOptions);
    }

    let completed = 0;
    let total = 0;
    for (const col of importData.collections) {
      total += col.documents.length;
    }

    for (const colData of importData.collections) {
      // Create collection if it doesn't exist
      let collection = await this.storage.getCollectionByName(colData.name);
      if (!collection) {
        collection = {
          id: colData.name,
          name: colData.name,
          dimensions: colData.dimensions,
          createdAt: Date.now(),
        };
        await this.storage.createCollection(collection);
      }

      // Import documents
      for (const docData of colData.documents) {
        if (docData.vector) {
          const vector = new Float32Array(docData.vector);
          const now = Date.now();

          await this.storage.addDocument({
            id: docData.id,
            collectionId: collection.id,
            metadata: docData.metadata,
            createdAt: now,
            updatedAt: now,
          });

          await this.storage.addVector({
            id: docData.id,
            collectionId: collection.id,
            vector,
          });

          // Add to index if this is the current collection
          if (collection.id === this.collectionId) {
            this.index!.add(docData.id, vector);
          }
        }

        completed++;
        options?.onProgress?.(completed, total);
      }
    }

    await this.saveIndex();
  }
}

/**
 * Create a new VectorDB instance.
 */
export async function createVectorDB(config: VectorDBConfig): Promise<VectorDB> {
  const db = new VectorDBImpl({
    ...config,
    storage: config.storage ?? DEFAULT_CONFIG.storage,
    indexOptions: {
      ...DEFAULT_CONFIG.indexOptions,
      ...config.indexOptions,
    },
  });

  await db.initialize();
  return db;
}
