/**
 * Embedding Drift Detection & Reindex Engine
 *
 * Provides model fingerprint comparison and batch re-embedding
 * for collections whose embedding model has changed.
 *
 * @packageDocumentation
 */

import type {
  EmbeddingModel,
  ModelFingerprint,
  ModelCompatibilityResult,
  ReindexOptions,
  ReindexResult,
  ReindexProgress,
} from './types.js';
import type { VectorDB, Collection } from '../types.js';
import { embedMany } from './embed.js';
import { globalEventBus } from '../events/index.js';
import { LockManager } from '../sync/locks.js';

// ═══════════════════════════════════════════════════════════════
// FINGERPRINT HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Extract a ModelFingerprint from an EmbeddingModel instance.
 *
 * @param model - The embedding model to fingerprint
 * @returns ModelFingerprint with modelId, provider, and dimensions
 *
 * @example
 * ```ts
 * const fingerprint = extractFingerprint(
 *   transformers.embedding('Xenova/bge-small-en-v1.5')
 * );
 * // { modelId: 'Xenova/bge-small-en-v1.5', provider: 'transformers', dimensions: 384 }
 * ```
 */
export function extractFingerprint(model: EmbeddingModel): ModelFingerprint {
  return {
    modelId: model.modelId,
    provider: model.provider,
    dimensions: model.dimensions,
  };
}

/**
 * Check whether two ModelFingerprints represent the same embedding model.
 *
 * @param a - First fingerprint
 * @param b - Second fingerprint
 * @returns true if modelId, provider, and dimensions all match
 */
export function fingerprintsMatch(a: ModelFingerprint, b: ModelFingerprint): boolean {
  return (
    a.modelId === b.modelId &&
    a.provider === b.provider &&
    a.dimensions === b.dimensions
  );
}

// ═══════════════════════════════════════════════════════════════
// DEFAULT TEXT FIELDS
// ═══════════════════════════════════════════════════════════════

/** Default metadata fields to search for source text, in priority order */
const DEFAULT_TEXT_FIELDS = ['_text', 'text', 'content', 'body', '__text', 'pageContent'];

/**
 * Extract text from document metadata using the default field lookup strategy.
 *
 * @param metadata - Document metadata object
 * @param textField - Primary field to check (default: '_text')
 * @returns The text string, or null if no text field found
 */
function defaultTextExtractor(
  metadata: Record<string, unknown>,
  textField?: string,
): string | null {
  // Check primary field first
  if (textField && typeof metadata[textField] === 'string') {
    return metadata[textField] as string;
  }

  // Fall back to default fields
  for (const field of DEFAULT_TEXT_FIELDS) {
    if (typeof metadata[field] === 'string') {
      return metadata[field] as string;
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// REINDEX CURSOR (RESUMABILITY)
// ═══════════════════════════════════════════════════════════════

/** Persisted cursor for resumable reindex operations */
interface ReindexCursor {
  lastDocId: string;
  completed: number;
  total: number;
  modelFingerprint: ModelFingerprint;
  startedAt: number;
}

/**
 * Get the meta store key for a reindex cursor.
 */
function getCursorKey(collectionId: string): string {
  return `reindex_progress_${collectionId}`;
}

// ═══════════════════════════════════════════════════════════════
// CHECK MODEL COMPATIBILITY
// ═══════════════════════════════════════════════════════════════

/**
 * Check model compatibility for a VectorDB collection without side effects.
 *
 * Compares the stored model fingerprint (if any) against the provided model
 * and returns compatibility status, model info, and document count.
 * This is a read-only operation -- it does not modify storage or emit events.
 *
 * @param db - VectorDB instance (must be initialized)
 * @param model - Current embedding model to check against
 * @returns Compatibility result with status, stored/current model info, and document count
 *
 * @example
 * ```ts
 * import { checkModelCompatibility } from '@localmode/core';
 *
 * const result = await checkModelCompatibility(db, newModel);
 * if (result.status === 'incompatible') {
 *   console.log(`Model changed from ${result.storedModel?.modelId} to ${result.currentModel.modelId}`);
 *   console.log(`${result.documentCount} documents need re-embedding`);
 * }
 * ```
 *
 * @see {@link reindexCollection} for re-embedding documents after drift detection
 */
export async function checkModelCompatibility(
  db: VectorDB,
  model: EmbeddingModel,
): Promise<ModelCompatibilityResult> {
  const currentFingerprint = extractFingerprint(model);

  // Access the internal VectorDB implementation to read the collection
  const dbImpl = db as unknown as {
    getCollectionName: () => string;
    getCollectionId: () => string;
    getStorage: () => {
      getCollectionByName: (name: string) => Promise<Collection | null>;
      countDocuments: (collectionId: string) => Promise<number>;
    };
  };

  const storage = dbImpl.getStorage();
  const collectionName = dbImpl.getCollectionName();
  const collectionId = dbImpl.getCollectionId();

  const collection = await storage.getCollectionByName(collectionName);
  const documentCount = collection
    ? await storage.countDocuments(collectionId)
    : 0;

  if (!collection || !collection.modelFingerprint) {
    // No stored fingerprint — treat as compatible (unknown model)
    return {
      status: 'compatible',
      storedModel: null,
      currentModel: currentFingerprint,
      documentCount,
    };
  }

  const stored = collection.modelFingerprint;

  // Check dimension mismatch first
  if (stored.dimensions !== currentFingerprint.dimensions) {
    return {
      status: 'dimension-mismatch',
      storedModel: stored,
      currentModel: currentFingerprint,
      documentCount,
    };
  }

  // Check model identity
  if (
    stored.modelId !== currentFingerprint.modelId ||
    stored.provider !== currentFingerprint.provider
  ) {
    return {
      status: 'incompatible',
      storedModel: stored,
      currentModel: currentFingerprint,
      documentCount,
    };
  }

  return {
    status: 'compatible',
    storedModel: stored,
    currentModel: currentFingerprint,
    documentCount,
  };
}

// ═══════════════════════════════════════════════════════════════
// REINDEX COLLECTION
// ═══════════════════════════════════════════════════════════════

/**
 * Re-embed all documents in a VectorDB collection using a new embedding model.
 *
 * Iterates all documents, extracts text from metadata (using `_text` field by default
 * or a custom `textExtractor`), re-embeds the text in batches, updates stored vectors,
 * and rebuilds the HNSW index. Documents without text metadata are skipped.
 *
 * Features:
 * - **Resumable**: Persists progress cursor so interrupted operations resume from where they left off
 * - **Background priority**: Integrates with inference queue at `'background'` priority
 * - **Cross-tab safe**: Uses Web Locks to ensure only one tab reindexes at a time
 * - **Cancellable**: Supports AbortSignal for graceful cancellation
 * - **Progress tracking**: Calls `onProgress` and emits events via `globalEventBus`
 *
 * @param db - VectorDB instance (must be initialized)
 * @param model - New embedding model to re-embed with
 * @param options - Reindex options (AbortSignal, progress, queue, batchSize, etc.)
 * @returns Result with reindexed count, skipped count, and duration
 *
 * @example
 * ```ts
 * import { reindexCollection } from '@localmode/core';
 *
 * const result = await reindexCollection(db, newModel, {
 *   batchSize: 32,
 *   onProgress: ({ completed, total, skipped, phase }) => {
 *     console.log(`${phase}: ${completed}/${total} (${skipped} skipped)`);
 *   },
 * });
 *
 * console.log(`Reindexed ${result.reindexed}, skipped ${result.skipped}`);
 * ```
 *
 * @throws {Error} If aborted via AbortSignal
 * @see {@link checkModelCompatibility} for checking compatibility before reindexing
 */
export async function reindexCollection(
  db: VectorDB,
  model: EmbeddingModel,
  options?: ReindexOptions,
): Promise<ReindexResult> {
  const {
    abortSignal,
    onProgress,
    queue,
    batchSize = 50,
    textExtractor,
    textField,
  } = options ?? {};

  // Check for cancellation before starting
  abortSignal?.throwIfAborted();

  const targetFingerprint = extractFingerprint(model);

  // Access internal VectorDB implementation
  const dbImpl = db as unknown as {
    getCollectionName: () => string;
    getCollectionId: () => string;
    getDBName: () => string;
    getStorage: () => {
      getCollectionByName: (name: string) => Promise<Collection | null>;
      getAllDocuments: (collectionId: string) => Promise<Array<{ id: string; collectionId: string; metadata?: Record<string, unknown>; createdAt: number; updatedAt: number }>>;
      countDocuments: (collectionId: string) => Promise<number>;
      addVector: (vec: { id: string; collectionId: string; vector: Float32Array | Uint8Array }) => Promise<void>;
      updateCollection: (collection: Collection) => Promise<void>;
      saveIndex: (collectionId: string, index: unknown) => Promise<void>;
    };
    getIndex: () => { add: (id: string, vector: Float32Array) => void; serialize: () => unknown } | null;
    getLockManager: () => LockManager | null;
  };

  const storage = dbImpl.getStorage();
  const collectionName = dbImpl.getCollectionName();
  const collectionId = dbImpl.getCollectionId();
  const dbName = dbImpl.getDBName();

  // Create a lock manager for cross-tab coordination
  const lockManager = dbImpl.getLockManager() ?? new LockManager(dbName);

  // Acquire exclusive lock for reindex
  return lockManager.withWriteLock(`reindex_${collectionId}`, async () => {
    const startTime = Date.now();

    abortSignal?.throwIfAborted();

    // Get all documents sorted by ID for deterministic ordering
    const allDocs = await storage.getAllDocuments(collectionId);
    allDocs.sort((a, b) => a.id.localeCompare(b.id));

    const total = allDocs.length;
    let completed = 0;
    let skipped = 0;
    let reindexed = 0;
    let resumed = false;

    // Check for existing cursor (resumability)
    let startIndex = 0;
    const collection = await storage.getCollectionByName(collectionName);

    // Try to read cursor from collection metadata (stored as meta key)
    // For simplicity we check if the storage has getMeta/setMeta
    const metaStorage = storage as unknown as {
      getMeta?: (key: string) => Promise<unknown>;
      setMeta?: (key: string, value: unknown) => Promise<void>;
      deleteMeta?: (key: string) => Promise<void>;
    };

    const cursorKey = getCursorKey(collectionId);
    let cursor: ReindexCursor | null = null;

    // Try to load cursor if the storage supports meta operations
    if (typeof metaStorage.getMeta === 'function') {
      const rawCursor = await metaStorage.getMeta(cursorKey);
      if (rawCursor && typeof rawCursor === 'object') {
        const c = rawCursor as ReindexCursor;
        // Only resume if the target model matches
        if (
          c.modelFingerprint &&
          c.modelFingerprint.modelId === targetFingerprint.modelId &&
          c.modelFingerprint.provider === targetFingerprint.provider &&
          c.modelFingerprint.dimensions === targetFingerprint.dimensions
        ) {
          cursor = c;
          completed = c.completed;
          resumed = true;

          // Find the start index (first doc after lastDocId)
          const lastIdx = allDocs.findIndex((d) => d.id === c.lastDocId);
          if (lastIdx >= 0) {
            startIndex = lastIdx + 1;
          }
        } else if (typeof metaStorage.deleteMeta === 'function') {
          // Stale cursor — discard it
          await metaStorage.deleteMeta(cursorKey);
        }
      }
    }

    // Emit reindexStart event
    globalEventBus.emit('reindexStart', {
      collection: collectionName,
      total,
      resumed,
    });

    // Separate documents into those with text and those without
    const docsToProcess = allDocs.slice(startIndex);

    // Process in batches
    for (let i = 0; i < docsToProcess.length; i += batchSize) {
      abortSignal?.throwIfAborted();

      const batch = docsToProcess.slice(i, i + batchSize);
      const textsToEmbed: string[] = [];
      const docIdsForEmbedding: string[] = [];
      let batchSkipped = 0;

      for (const doc of batch) {
        if (!doc.metadata) {
          batchSkipped++;
          continue;
        }

        const text = textExtractor
          ? textExtractor(doc.metadata)
          : defaultTextExtractor(doc.metadata, textField);

        if (text) {
          textsToEmbed.push(text);
          docIdsForEmbedding.push(doc.id);
        } else {
          batchSkipped++;
        }
      }

      skipped += batchSkipped;

      // Re-embed the texts if any
      if (textsToEmbed.length > 0) {
        let embeddings: Float32Array[];

        if (queue) {
          // Use inference queue at background priority
          const result = await queue.add(
            () => embedMany({ model, values: textsToEmbed }),
            { priority: 'background' },
          );
          embeddings = result.embeddings;
        } else {
          const result = await embedMany({
            model,
            values: textsToEmbed,
            abortSignal,
          });
          embeddings = result.embeddings;
        }

        // Update vectors in storage and HNSW index
        const index = dbImpl.getIndex();
        for (let j = 0; j < embeddings.length; j++) {
          const docId = docIdsForEmbedding[j];
          const newVector = embeddings[j];

          await storage.addVector({
            id: docId,
            collectionId,
            vector: newVector,
          });

          if (index) {
            index.add(docId, newVector);
          }
        }

        reindexed += embeddings.length;
      }

      completed += batch.length;

      // Report progress
      const progress: ReindexProgress = {
        completed,
        total,
        skipped,
        phase: 'embedding',
      };

      onProgress?.(progress);

      globalEventBus.emit('reindexProgress', {
        collection: collectionName,
        ...progress,
      });

      // Persist cursor for resumability
      if (typeof metaStorage.setMeta === 'function') {
        const lastDoc = batch[batch.length - 1];
        const cursorData: ReindexCursor = {
          lastDocId: lastDoc.id,
          completed,
          total,
          modelFingerprint: targetFingerprint,
          startedAt: cursor?.startedAt ?? startTime,
        };
        await metaStorage.setMeta(cursorKey, cursorData);
      }
    }

    // Rebuild the HNSW index
    const indexProgress: ReindexProgress = {
      completed: total,
      total,
      skipped,
      phase: 'indexing',
    };
    onProgress?.(indexProgress);
    globalEventBus.emit('reindexProgress', {
      collection: collectionName,
      ...indexProgress,
    });

    // Save the HNSW index
    const index = dbImpl.getIndex();
    if (index) {
      await storage.saveIndex(collectionId, index.serialize());
    }

    // Update the collection's model fingerprint
    if (collection) {
      collection.modelFingerprint = targetFingerprint;
      await storage.updateCollection(collection);
    }

    // Clean up cursor
    if (typeof metaStorage.deleteMeta === 'function') {
      await metaStorage.deleteMeta(cursorKey);
    }

    const durationMs = Date.now() - startTime;

    // Emit reindexComplete event
    globalEventBus.emit('reindexComplete', {
      collection: collectionName,
      reindexed,
      skipped,
      durationMs,
    });

    return { reindexed, skipped, durationMs };
  });
}
