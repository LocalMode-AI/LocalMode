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
  RecalibrateOptions,
  DBStats,
  TypedFilterQuery,
  StoredDocument,
  Collection,
} from './types.js';
import type { ObjectSchema } from './generation/types.js';
import { DEFAULT_CONFIG } from './types.js';
import { HNSWIndex } from './hnsw/index.js';
import { createStorage, type Storage } from './storage/index.js';
import type { StorageAdapter } from './storage/types.js';
import { matchesFilter } from './query/filter.js';
import { LockManager } from './sync/locks.js';
import { Broadcaster } from './sync/broadcast.js';
import type { QuantizationConfig, ScalarCalibrationData, PQCodebook } from './quantization/types.js';
import { calibrate, scalarQuantize, scalarDequantize } from './quantization/scalar.js';
import { trainPQ, pqQuantize, pqDequantize } from './quantization/pq.js';
import type { CompressionConfig } from './storage/compression.js';
import type { EmbeddingModel, ModelFingerprint } from './embeddings/types.js';
import { globalEventBus } from './events/index.js';

/**
 * Internal VectorDB implementation.
 */
export class VectorDBImpl<TMetadata extends Record<string, unknown> = Record<string, unknown>> implements VectorDB<TMetadata> {
  private storage: Storage | StorageAdapter;
  private index: HNSWIndex | null = null;
  private collectionId: string;
  private collectionName: string;
  private dimensions: number;
  private config: VectorDBConfig<TMetadata>;
  private initialized = false;
  private lockManager: LockManager | null = null;
  private broadcaster: Broadcaster | null = null;
  private schema: ObjectSchema<TMetadata> | undefined;

  /** Quantization config (if enabled) */
  private quantizationConfig: QuantizationConfig | undefined;
  /** Calibration data for scalar quantization */
  private calibration: ScalarCalibrationData | null = null;
  /** Trained codebook for product quantization */
  private pqCodebook: PQCodebook | null = null;
  /** Embedding model reference for drift detection */
  private model: EmbeddingModel | undefined;

  /** Storage compression config (if enabled) */
  compressionConfig: CompressionConfig | undefined;
  /** Calibration data for storage compression (separate from quantization calibration) */
  private compressionCalibration: ScalarCalibrationData | null = null;
  /** Delta calibration for delta-sq8 compression mode */
  private deltaCalibration: ScalarCalibrationData | null = null;

  constructor(
    config: VectorDBConfig<TMetadata>,
    collectionName = 'default',
    existingStorage?: Storage | StorageAdapter,
  ) {
    this.config = config;
    this.dimensions = config.dimensions;
    this.collectionName = collectionName;
    this.collectionId = collectionName; // Use name as ID for simplicity
    this.schema = config.schema;
    this.quantizationConfig = config.quantization;
    this.model = config.model;

    // Storage compression config (independent of quantization)
    const rawCompression = config.compression;
    this.compressionConfig = rawCompression && rawCompression.type !== 'none'
      ? rawCompression
      : undefined;

    if (existingStorage) {
      this.storage = existingStorage;
    } else if (typeof config.storage === 'object') {
      // Custom StorageAdapter instance passed via config
      this.storage = config.storage;
    } else {
      this.storage = createStorage(config.storage ?? 'indexeddb', config.name);
    }

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

      // Store model fingerprint on new collections if model is provided
      if (this.model) {
        collection.modelFingerprint = {
          modelId: this.model.modelId,
          provider: this.model.provider,
          dimensions: this.model.dimensions,
        };
      }

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

    // Restore calibration data from collection if present
    if (collection.calibration) {
      this.calibration = collection.calibration;
    }

    // Restore PQ codebook from collection if present
    if (collection.pqCodebook) {
      this.pqCodebook = collection.pqCodebook;
    }

    // Restore storage compression calibration from collection if present
    if (collection.compressionCalibration) {
      this.compressionCalibration = collection.compressionCalibration;
    }
    if (collection.deltaCalibration) {
      this.deltaCalibration = collection.deltaCalibration;
    }

    // Warn if both compression and quantization are enabled
    if (this.compressionConfig && this.quantizationConfig) {
      console.warn(
        'Storage compression has no effect when vector quantization is already enabled. ' +
        'Quantization already stores vectors as Uint8Array (1 byte/dim). ' +
        'Compression is most useful when quantization is NOT enabled.'
      );
    }

    // Model fingerprint drift detection
    if (this.model) {
      const currentFingerprint: ModelFingerprint = {
        modelId: this.model.modelId,
        provider: this.model.provider,
        dimensions: this.model.dimensions,
      };

      if (collection.modelFingerprint) {
        // Compare stored fingerprint with current model
        const stored = collection.modelFingerprint;
        if (
          stored.modelId !== currentFingerprint.modelId ||
          stored.provider !== currentFingerprint.provider
        ) {
          // Same dimensions but different model — emit drift event
          if (stored.dimensions === currentFingerprint.dimensions) {
            const docCount = await this.storage.countDocuments(this.collectionId);
            globalEventBus.emit('modelDriftDetected', {
              collection: this.collectionName,
              storedModel: stored,
              currentModel: currentFingerprint,
              documentCount: docCount,
            });
          }
          // Dimension mismatch is already caught above by the dimension check
        }
      } else {
        // No stored fingerprint — first use, save current model's fingerprint
        collection.modelFingerprint = currentFingerprint;
        await this.storage.updateCollection(collection);
      }
    }

    // Load or create index
    const savedIndex = await this.storage.loadIndex(this.collectionId);
    const vectors = await this.loadAllVectorsForIndex();

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
   * Load all vectors from storage, decompressing/dequantizing as necessary.
   * Returns Float32Array vectors for the HNSW index (which always uses Float32).
   */
  private async loadAllVectorsForIndex(): Promise<Map<string, Float32Array>> {
    const raw = await this.storage.getAllVectors(this.collectionId);

    // Decompress/dequantize any Uint8Array vectors for the HNSW index
    const result = new Map<string, Float32Array>();
    for (const [id, stored] of raw) {
      result.set(id, this.decompressFromStorage(stored));
    }
    return result;
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

  /**
   * Persist calibration data (scalar) or codebook (PQ) to the collection record.
   */
  private async saveCalibration(): Promise<void> {
    const collection = await this.storage.getCollectionByName(this.collectionName);
    if (!collection) return;

    if (this.calibration) {
      collection.calibration = this.calibration;
    }

    if (this.pqCodebook) {
      collection.pqCodebook = this.pqCodebook;
    }

    await this.storage.updateCollection(collection);
  }

  /**
   * Perform initial calibration from the first batch of vectors.
   * Called when quantization is enabled and no calibration/codebook exists yet.
   *
   * For scalar quantization, computes per-dimension min/max.
   * For product quantization, trains a PQ codebook via k-means clustering.
   */
  private calibrateFromVectors(vectors: Float32Array[]): void {
    if (!this.quantizationConfig) return;

    const maxSamples = this.quantizationConfig.calibrationSamples ?? 1000;

    // Sample vectors if there are too many
    let sampled = vectors;
    if (maxSamples > 0 && vectors.length > maxSamples) {
      sampled = [];
      const step = vectors.length / maxSamples;
      for (let i = 0; i < maxSamples; i++) {
        sampled.push(vectors[Math.floor(i * step)]);
      }
    }

    if (this.quantizationConfig.type === 'pq') {
      // Train PQ codebook
      this.pqCodebook = trainPQ(sampled, {
        subvectors: this.quantizationConfig.subvectors,
        centroids: this.quantizationConfig.centroids,
        maxIterations: this.quantizationConfig.maxIterations,
        calibrationSamples: 0, // Already sampled above
      });
    } else {
      // Scalar calibration
      this.calibration = calibrate(sampled);
    }
  }

  /**
   * Quantize a vector for storage if quantization is enabled.
   * Returns the vector as-is if quantization is not enabled or not yet calibrated/trained.
   */
  private quantizeForStorage(vector: Float32Array): Float32Array | Uint8Array {
    if (!this.quantizationConfig) {
      return vector;
    }

    if (this.quantizationConfig.type === 'pq' && this.pqCodebook) {
      return pqQuantize(vector, this.pqCodebook);
    }

    if (this.quantizationConfig.type === 'scalar' && this.calibration) {
      return scalarQuantize(vector, this.calibration);
    }

    return vector;
  }

  /**
   * Compress a Float32Array vector for storage if compression is enabled.
   * Returns the vector unchanged if compression is disabled or the vector is already Uint8Array.
   */
  private compressForStorage(vector: Float32Array | Uint8Array): Float32Array | Uint8Array {
    // Skip compression if not enabled
    if (!this.compressionConfig) {
      return vector;
    }

    // Skip if already Uint8Array (e.g., from quantization)
    if (vector instanceof Uint8Array) {
      return vector;
    }

    // Skip if no compression calibration yet
    if (!this.compressionCalibration) {
      return vector;
    }

    return scalarQuantize(vector, this.compressionCalibration);
  }

  /**
   * Decompress a stored vector if compression is enabled.
   * Returns a Float32Array regardless of whether the vector was compressed.
   */
  private decompressFromStorage(stored: Float32Array | Uint8Array): Float32Array {
    if (stored instanceof Float32Array) {
      return stored;
    }

    // Check for storage compression first (separate from quantization)
    if (this.compressionConfig && this.compressionCalibration) {
      return scalarDequantize(stored, this.compressionCalibration);
    }

    // Fall back to quantization decompression
    if (this.pqCodebook) {
      return pqDequantize(stored, this.pqCodebook);
    }

    if (this.calibration) {
      return scalarDequantize(stored, this.calibration);
    }

    // Last resort: reinterpret as Float32Array
    return new Float32Array(stored);
  }

  /**
   * Persist storage compression calibration data to the collection record.
   */
  private async saveCompressionCalibration(): Promise<void> {
    const collection = await this.storage.getCollectionByName(this.collectionName);
    if (!collection) return;

    if (this.compressionCalibration) {
      collection.compressionCalibration = this.compressionCalibration;
    }

    if (this.deltaCalibration) {
      collection.deltaCalibration = this.deltaCalibration;
    }

    if (this.compressionConfig) {
      collection.compression = { type: this.compressionConfig.type };
    }

    await this.storage.updateCollection(collection);
  }

  /**
   * Perform initial compression calibration from the first batch of vectors.
   * Called when storage compression is enabled and no compression calibration exists yet.
   */
  private calibrateCompressionFromVectors(vectors: Float32Array[]): void {
    if (!this.compressionConfig) return;

    const maxSamples = this.compressionConfig.calibrationSamples ?? 1000;

    // Sample vectors if there are too many
    let sampled = vectors;
    if (maxSamples > 0 && vectors.length > maxSamples) {
      sampled = [];
      const step = vectors.length / maxSamples;
      for (let i = 0; i < maxSamples; i++) {
        sampled.push(vectors[Math.floor(i * step)]);
      }
    }

    this.compressionCalibration = calibrate(sampled);

    // For delta-sq8, we compute delta calibration from the batch
    if (this.compressionConfig.type === 'delta-sq8' && sampled.length > 1) {
      const dimensions = sampled[0].length;
      const deltas: Float32Array[] = [];
      for (let i = 1; i < sampled.length; i++) {
        const delta = new Float32Array(dimensions);
        for (let d = 0; d < dimensions; d++) {
          delta[d] = sampled[i][d] - sampled[i - 1][d];
        }
        deltas.push(delta);
      }
      this.deltaCalibration = calibrate(deltas);
    }
  }

  // ============================================
  // Public API
  // ============================================

  async add(doc: Document<TMetadata>): Promise<void> {
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

    // Validate metadata against schema if provided
    if (this.schema && doc.metadata !== undefined) {
      try {
        this.schema.parse(doc.metadata);
      } catch (err) {
        throw new Error(
          `Metadata validation failed for document "${doc.id}": ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    const operation = async (): Promise<void> => {
      const now = Date.now();

      // Calibrate/train on first add if quantization is enabled and not yet calibrated
      if (this.quantizationConfig && !this.calibration && !this.pqCodebook) {
        this.calibrateFromVectors([doc.vector]);
        await this.saveCalibration();
      }

      // Calibrate storage compression on first add if enabled and not yet calibrated
      if (this.compressionConfig && !this.compressionCalibration) {
        this.calibrateCompressionFromVectors([doc.vector]);
        await this.saveCompressionCalibration();
      }

      // Store document metadata (cast to storage layer's untyped format)
      const storedDoc: StoredDocument = {
        id: doc.id,
        collectionId: this.collectionId,
        metadata: doc.metadata as Record<string, unknown> | undefined,
        createdAt: now,
        updatedAt: now,
      };
      await this.storage.addDocument(storedDoc);

      // Store vector (quantized if enabled, then compressed if enabled)
      let storageVector: Float32Array | Uint8Array = this.quantizeForStorage(doc.vector);
      storageVector = this.compressForStorage(storageVector);
      await this.storage.addVector({
        id: doc.id,
        collectionId: this.collectionId,
        vector: storageVector,
      });

      // Add to HNSW index with original Float32Array
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

  async addMany(docs: Document<TMetadata>[], options?: AddManyOptions): Promise<void> {
    this.ensureInitialized();

    const batchSize = options?.batchSize ?? 100;
    const total = docs.length;
    let completed = 0;

    // Calibrate/train from the first batch if quantization is enabled and not yet calibrated
    if (this.quantizationConfig && !this.calibration && !this.pqCodebook && docs.length > 0) {
      const vectors = docs.map((d) => d.vector);
      this.calibrateFromVectors(vectors);
      await this.saveCalibration();
    }

    // Calibrate storage compression from the first batch if enabled and not yet calibrated
    if (this.compressionConfig && !this.compressionCalibration && docs.length > 0) {
      const vectors = docs.map((d) => d.vector);
      this.calibrateCompressionFromVectors(vectors);
      await this.saveCompressionCalibration();
    }

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

        // Validate metadata against schema if provided
        if (this.schema && doc.metadata !== undefined) {
          try {
            this.schema.parse(doc.metadata);
          } catch (err) {
            throw new Error(
              `Metadata validation failed for document "${doc.id}": ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        const now = Date.now();

        // Store document metadata (cast to storage layer's untyped format)
        await this.storage.addDocument({
          id: doc.id,
          collectionId: this.collectionId,
          metadata: doc.metadata as Record<string, unknown> | undefined,
          createdAt: now,
          updatedAt: now,
        });

        // Store vector (quantized if enabled, then compressed if enabled)
        let storageVector: Float32Array | Uint8Array = this.quantizeForStorage(doc.vector);
        storageVector = this.compressForStorage(storageVector);
        await this.storage.addVector({
          id: doc.id,
          collectionId: this.collectionId,
          vector: storageVector,
        });

        // Add to HNSW index with original Float32Array
        this.index!.add(doc.id, doc.vector);
      }

      completed += batch.length;
      options?.onProgress?.(completed, total);
    }

    // Save index after all additions
    await this.saveIndex();
  }

  async search(vector: Float32Array, options?: SearchOptions<TMetadata>): Promise<SearchResult<TMetadata>[]> {
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
    const rawResults = await this.index!.search(vector, searchK);

    const results: SearchResult<TMetadata>[] = [];

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

      const searchResult: SearchResult<TMetadata> = {
        id: result.id,
        score: result.score,
        metadata: doc.metadata as TMetadata | undefined,
      };

      if (includeVectors) {
        // Return decompressed/dequantized vector
        const stored = await this.storage.getVector(result.id);
        if (stored) {
          searchResult.vector = this.decompressFromStorage(stored);
        }
      }

      results.push(searchResult);

      // Stop if we have enough results
      if (results.length >= k) {
        break;
      }
    }

    return results;
  }

  async get(id: string): Promise<(Document<TMetadata> & { metadata?: TMetadata }) | null> {
    this.ensureInitialized();

    const doc = await this.storage.getDocument(id);
    if (!doc || doc.collectionId !== this.collectionId) {
      return null;
    }

    const stored = await this.storage.getVector(id);
    if (!stored) {
      return null;
    }

    // Decompress / dequantize as needed
    const vector = this.decompressFromStorage(stored);

    return {
      id: doc.id,
      vector,
      metadata: doc.metadata as TMetadata | undefined,
    };
  }

  async update(id: string, updates: Partial<Omit<Document<TMetadata>, 'id'>>): Promise<void> {
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
          metadata: updates.metadata as Record<string, unknown> | undefined,
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

        // Store quantized and/or compressed if enabled
        let storageVector: Float32Array | Uint8Array = this.quantizeForStorage(updates.vector);
        storageVector = this.compressForStorage(storageVector);
        await this.storage.addVector({
          id,
          collectionId: this.collectionId,
          vector: storageVector,
        });

        // Update HNSW index with original Float32Array
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

  async deleteWhere(filter: TypedFilterQuery<TMetadata>): Promise<number> {
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

  collection(name: string): VectorDB<TMetadata> {
    // Create a new VectorDB instance for the collection
    const collectionDb = new VectorDBImpl<TMetadata>(this.config, name, this.storage);
    // Note: The collection needs to be initialized before use
    // This is a sync method, so we return an uninitialized instance
    // The user should await operations which will trigger initialization
    return new Proxy(collectionDb as VectorDB<TMetadata>, {
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
      // Destroy GPU on old index before creating new one
      this.index?.destroyGPU();
      this.index = new HNSWIndex(this.dimensions, this.config.indexOptions);
      this.calibration = null;
      this.pqCodebook = null;
      this.compressionCalibration = null;
      this.deltaCalibration = null;

      // Clear calibration / codebook / compression metadata from stored collection
      const collection = await this.storage.getCollectionByName(this.collectionName);
      if (collection) {
        collection.calibration = undefined;
        collection.pqCodebook = undefined;
        collection.compressionCalibration = undefined;
        collection.deltaCalibration = undefined;
        collection.compression = undefined;
        await this.storage.updateCollection(collection);
      }

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
      // Clean up GPU resources if initialized
      this.index.destroyGPU();
    }
    await this.storage.close();

    // Clean up sync resources
    this.broadcaster?.close();
    this.broadcaster = null;

    this.initialized = false;
  }

  /**
   * Recalibrate quantization from current vectors and re-quantize all stored vectors.
   *
   * This is useful when the distribution of vectors has changed significantly
   * since the initial calibration (e.g., after many updates/deletes).
   *
   * @param options - Options including AbortSignal and progress callback.
   * @throws Error if quantization is not enabled on this VectorDB.
   */
  async recalibrate(options?: RecalibrateOptions): Promise<void> {
    this.ensureInitialized();

    if (!this.quantizationConfig) {
      throw new Error(
        'Cannot recalibrate: quantization is not enabled on this VectorDB. ' +
        'Create the database with quantization: { type: "scalar" } or { type: "pq" } to enable it.'
      );
    }

    const abortSignal = options?.abortSignal;
    const onProgress = options?.onProgress;

    abortSignal?.throwIfAborted();

    // Step 1: Read all vectors from HNSW index (Float32Array, in-memory)
    const allVectors: Float32Array[] = [];
    const allIds: string[] = [];

    const docs = await this.storage.getAllDocuments(this.collectionId);
    for (const doc of docs) {
      const vector = this.index!.getVector(doc.id);
      if (vector) {
        allVectors.push(vector);
        allIds.push(doc.id);
      }
    }

    if (allVectors.length === 0) {
      return; // Nothing to recalibrate
    }

    abortSignal?.throwIfAborted();

    // Step 2: Recalibrate / retrain codebook
    this.calibrateFromVectors(allVectors);
    await this.saveCalibration();

    abortSignal?.throwIfAborted();

    // Step 3: Re-quantize and update stored vectors
    const total = allIds.length;
    for (let i = 0; i < total; i++) {
      abortSignal?.throwIfAborted();

      const id = allIds[i];
      const vector = allVectors[i];
      const quantized = this.quantizeForStorage(vector);

      await this.storage.addVector({
        id,
        collectionId: this.collectionId,
        vector: quantized,
      });

      onProgress?.(i + 1, total);
    }
  }

  /**
   * Get the collection name.
   */
  getCollectionName(): string {
    return this.collectionName;
  }

  /**
   * Get the collection ID.
   */
  getCollectionId(): string {
    return this.collectionId;
  }

  /**
   * Get the internal storage adapter (for advanced usage like reindexing).
   */
  getStorage(): Storage | StorageAdapter {
    return this.storage;
  }

  /**
   * Get the HNSW index (for advanced usage like reindexing).
   */
  getIndex(): HNSWIndex | null {
    return this.index;
  }

  /**
   * Get the database name from config.
   */
  getDBName(): string {
    return this.config.name;
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
          const stored = await this.storage.getVector(doc.id);
          if (stored) {
            // Decompress/dequantize for export to ensure portability (Float32 output)
            if (col.id === this.collectionId) {
              // Current collection — use instance helpers for decompression
              docData.vector = Array.from(this.decompressFromStorage(stored));
            } else if (col.pqCodebook && stored instanceof Uint8Array) {
              const dequantized = pqDequantize(stored, col.pqCodebook);
              docData.vector = Array.from(dequantized);
            } else if (col.compressionCalibration && stored instanceof Uint8Array) {
              const decompressed = scalarDequantize(stored, col.compressionCalibration);
              docData.vector = Array.from(decompressed);
            } else if (col.calibration && stored instanceof Uint8Array) {
              const dequantized = scalarDequantize(stored, col.calibration);
              docData.vector = Array.from(dequantized);
            } else {
              docData.vector = Array.from(stored);
            }
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
      this.index?.destroyGPU();
      this.index = new HNSWIndex(this.dimensions, this.config.indexOptions);
      this.calibration = null;
      this.pqCodebook = null;
      this.compressionCalibration = null;
      this.deltaCalibration = null;
    }

    let completed = 0;
    let total = 0;
    for (const col of importData.collections) {
      total += col.documents.length;
    }

    for (const colData of importData.collections) {
      // Create collection if it doesn't exist
      let collection: Collection | null = await this.storage.getCollectionByName(colData.name);
      if (!collection) {
        collection = {
          id: colData.name,
          name: colData.name,
          dimensions: colData.dimensions,
          createdAt: Date.now(),
        };
        await this.storage.createCollection(collection);
      }

      // Determine if this collection uses quantization or compression
      const isCurrentCollection = collection.id === this.collectionId;
      const useQuantization = isCurrentCollection && !!this.quantizationConfig;
      const useCompression = isCurrentCollection && !!this.compressionConfig;

      // If quantization is enabled and we have vectors to import, calibrate/train first
      if (useQuantization && !this.calibration && !this.pqCodebook) {
        const importVectors = colData.documents
          .filter((d) => d.vector)
          .map((d) => new Float32Array(d.vector!));
        if (importVectors.length > 0) {
          this.calibrateFromVectors(importVectors);
          await this.saveCalibration();
        }
      }

      // If compression is enabled and we have vectors to import, calibrate first
      if (useCompression && !this.compressionCalibration) {
        const importVectors = colData.documents
          .filter((d) => d.vector)
          .map((d) => new Float32Array(d.vector!));
        if (importVectors.length > 0) {
          this.calibrateCompressionFromVectors(importVectors);
          await this.saveCompressionCalibration();
        }
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

          // Store quantized and/or compressed if this is the current collection
          let storageVector: Float32Array | Uint8Array = useQuantization
            ? this.quantizeForStorage(vector)
            : vector;
          if (useCompression) {
            storageVector = this.compressForStorage(storageVector);
          }

          await this.storage.addVector({
            id: docData.id,
            collectionId: collection.id,
            vector: storageVector,
          });

          // Add to index if this is the current collection
          if (isCurrentCollection) {
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
 *
 * @param config - Configuration options for the database.
 * @returns Initialized VectorDB instance ready for use.
 *
 * @example
 * ```typescript
 * // Standard VectorDB
 * const db = await createVectorDB({
 *   name: 'my-db',
 *   dimensions: 384,
 * });
 *
 * // With scalar quantization (4x storage reduction)
 * const quantizedDb = await createVectorDB({
 *   name: 'quantized-db',
 *   dimensions: 384,
 *   quantization: { type: 'scalar' },
 * });
 *
 * // With product quantization (32x storage reduction for 384-dim)
 * const pqDb = await createVectorDB({
 *   name: 'pq-db',
 *   dimensions: 384,
 *   quantization: { type: 'pq' },
 * });
 * ```
 */
export async function createVectorDB<TMetadata extends Record<string, unknown> = Record<string, unknown>>(
  config: VectorDBConfig<TMetadata>
): Promise<VectorDB<TMetadata>> {
  // Merge enableGPU convenience flag into indexOptions.gpu
  const indexOptions = {
    ...DEFAULT_CONFIG.indexOptions,
    ...config.indexOptions,
  };

  if (config.enableGPU) {
    indexOptions.gpu = {
      enabled: true,
      ...indexOptions.gpu,
    };
  }

  const db = new VectorDBImpl<TMetadata>({
    ...config,
    storage: config.storage ?? DEFAULT_CONFIG.storage,
    indexOptions,
  });

  await db.initialize();
  return db;
}
