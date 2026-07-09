/**
 * Batch ingestion utilities for RAG pipelines.
 *
 * Provides high-level helpers for ingesting documents into
 * a vector database with chunking, embedding, and progress tracking.
 *
 * @packageDocumentation
 */

import type { VectorDB, Document } from '../types.js';
import type {
  SourceDocument,
  IngestOptions,
  IngestObjectOptions,
  IngestProgress,
  IngestResult,
  ChunkOptions,
  BM25Index,
} from './types.js';
import { DEFAULT_INGEST_OPTIONS, TEXT_METADATA_FIELD } from './types.js';
import { chunk } from './chunkers/index.js';
import { BM25 } from './bm25.js';
import { computeOptimalBatchSize } from '../capabilities/batch-size.js';
import { embedMany } from '../embeddings/embed.js';

/**
 * Distinguish a VectorDB first argument (positional form) from an
 * IngestObjectOptions first argument (object form).
 */
function isVectorDBArg(value: VectorDB | IngestObjectOptions): value is VectorDB {
  const candidate = value as Partial<VectorDB>;
  return typeof candidate.search === 'function' && typeof candidate.addMany === 'function';
}

/**
 * Generate a unique ID for a chunk.
 */
function generateChunkId(docId: string, chunkIndex: number, prefix: string): string {
  return `${prefix}_${docId}_${chunkIndex}`;
}

/**
 * Generate a document ID if not provided.
 */
function generateDocId(): string {
  return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Ingest documents into a vector database with chunking and optional embedding.
 *
 * This is the main high-level function for RAG ingestion pipelines.
 * Callable in two equivalent forms:
 * - Positional: `ingest(db, documents, options?)`
 * - Object: `ingest({ db, documents, model?, ...options })` — when `model`
 *   is provided, embeddings are generated via `embedMany()` and
 *   `generateEmbeddings` defaults to `true`.
 *
 * Chunk text is stored on each document's metadata under
 * {@link TEXT_METADATA_FIELD} (`_text`), which `semanticSearch()` resolves
 * onto `results[].text`.
 *
 * Supports cancellation via `abortSignal` (checked before chunking and
 * between embedding/indexing batches). Documents already added before an
 * abort are not rolled back.
 *
 * @param db - Vector database instance (positional form)
 * @param documents - Source documents to ingest (positional form)
 * @param options - Ingestion configuration
 * @returns Ingestion result with statistics
 * @throws Error when `db` is missing/not a VectorDB, when `documents` is not an
 *   array, when both `model` and `embedder` are provided, or when
 *   `generateEmbeddings` is true without a `model`/`embedder`
 *
 * @example
 * ```typescript
 * import { createVectorDB, ingest } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const db = await createVectorDB({ name: 'docs', dimensions: 384 });
 * const model = transformers.embedding('Xenova/bge-small-en-v1.5');
 *
 * // Object form with an embedding model
 * await ingest({ db, model, documents });
 *
 * // Positional form with a custom embedder
 * await ingest(db, documents, {
 *   generateEmbeddings: true,
 *   embedder: async (texts) => embedModel.embed(texts),
 * });
 * ```
 *
 * @see {@link semanticSearch} for querying ingested content
 */
export async function ingest(
  db: VectorDB,
  documents: SourceDocument[],
  options?: IngestOptions
): Promise<IngestResult>;
export async function ingest(options: IngestObjectOptions): Promise<IngestResult>;
export async function ingest(
  dbOrOptions: VectorDB | IngestObjectOptions,
  positionalDocuments?: SourceDocument[],
  positionalOptions: IngestOptions = {}
): Promise<IngestResult> {
  let db: VectorDB;
  let documents: SourceDocument[];
  let options: IngestOptions;

  if (isVectorDBArg(dbOrOptions)) {
    db = dbOrOptions;
    documents = positionalDocuments as SourceDocument[];
    options = positionalOptions;
  } else {
    const { db: objectDb, documents: objectDocuments, model, ...rest } = dbOrOptions;
    db = objectDb;
    documents = objectDocuments;
    options = rest;

    if (model) {
      if (rest.embedder) {
        throw new Error(
          'ingest() received both `model` and `embedder`. ' +
            'They are mutually exclusive ways to generate embeddings — pass exactly one.'
        );
      }
      options = {
        ...rest,
        // A model implies embedding generation unless explicitly disabled.
        generateEmbeddings: rest.generateEmbeddings ?? true,
        embedder: async (texts: string[]) => {
          const { embeddings } = await embedMany({
            model,
            values: texts,
            ...(rest.abortSignal ? { abortSignal: rest.abortSignal } : {}),
          });
          return embeddings;
        },
      };
    }
  }

  // Fail loudly on a missing db/documents rather than silently ingesting
  // nothing (JavaScript callers get no compile-time overload checking).
  if (!db || typeof db.addMany !== 'function') {
    throw new Error(
      'ingest() requires a VectorDB. ' +
        'Pass it positionally — ingest(db, documents, options) — or as `db` in the object form: ingest({ db, documents, model }).'
    );
  }
  if (!Array.isArray(documents)) {
    throw new Error(
      'ingest() requires a `documents` array. ' +
        'Pass it positionally — ingest(db, documents, options) — or as `documents` in the object form: ingest({ db, documents, model }).'
    );
  }

  const startTime = Date.now();
  const {
    chunking = { strategy: 'recursive' },
    batchSize: explicitBatchSize,
    adaptiveBatching,
    onProgress,
    idPrefix = DEFAULT_INGEST_OPTIONS.idPrefix,
    generateEmbeddings = DEFAULT_INGEST_OPTIONS.generateEmbeddings,
    embedder,
    buildBM25Index = DEFAULT_INGEST_OPTIONS.buildBM25Index,
    bm25Options,
    abortSignal,
  } = options;

  abortSignal?.throwIfAborted();

  // Determine batch size: explicit > adaptive > default (100)
  let batchSize: number;
  if (explicitBatchSize !== undefined) {
    batchSize = explicitBatchSize;
  } else if (adaptiveBatching) {
    batchSize = computeOptimalBatchSize({
      taskType: 'ingestion',
    }).batchSize;
  } else {
    batchSize = DEFAULT_INGEST_OPTIONS.batchSize;
  }

  // Validate options
  if (generateEmbeddings && !embedder) {
    throw new Error('embedder function is required when generateEmbeddings is true');
  }

  // Progress tracking
  const progress: IngestProgress = {
    phase: 'chunking',
    documentsProcessed: 0,
    totalDocuments: documents.length,
    chunksProcessed: 0,
    totalChunks: 0,
    currentBatch: 0,
    totalBatches: 0,
  };

  const reportProgress = () => {
    if (onProgress) {
      onProgress({ ...progress });
    }
  };

  // Phase 1: Chunking
  reportProgress();

  const allChunks: Array<{
    id: string;
    text: string;
    metadata: Record<string, unknown>;
    sourceDocId: string;
    chunkIndex: number;
  }> = [];

  for (const doc of documents) {
    const docId = doc.id || generateDocId();
    const chunks = chunk(doc.text, chunking as ChunkOptions);

    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      allChunks.push({
        id: generateChunkId(docId, i, idPrefix),
        text: c.text,
        metadata: {
          ...doc.metadata,
          sourceDocId: docId,
          chunkIndex: i,
          chunkStart: c.start,
          chunkEnd: c.end,
          ...c.metadata,
        },
        sourceDocId: docId,
        chunkIndex: i,
      });
    }

    progress.documentsProcessed++;
    reportProgress();
  }

  progress.totalChunks = allChunks.length;
  progress.totalBatches = Math.ceil(allChunks.length / batchSize);

  // Phase 2: Embedding (if requested)
  const vectors: Float32Array[] = [];

  if (generateEmbeddings && embedder) {
    progress.phase = 'embedding';
    reportProgress();

    // Process in batches
    for (let i = 0; i < allChunks.length; i += batchSize) {
      abortSignal?.throwIfAborted();

      const batch = allChunks.slice(i, i + batchSize);
      const texts = batch.map((c) => c.text);

      const batchVectors = await embedder(texts);
      vectors.push(...batchVectors);

      progress.chunksProcessed = Math.min(i + batchSize, allChunks.length);
      progress.currentBatch = Math.floor(i / batchSize) + 1;
      reportProgress();
    }
  }

  // Phase 3: Indexing
  progress.phase = 'indexing';
  progress.chunksProcessed = 0;
  progress.currentBatch = 0;
  reportProgress();

  const chunkIds: string[] = [];
  let bm25Index: BM25 | undefined;

  // Build BM25 index if requested
  if (buildBM25Index) {
    bm25Index = new BM25(bm25Options);
    for (const c of allChunks) {
      bm25Index.add(c.id, c.text);
    }
  }

  // If we have vectors, add to database
  if (vectors.length > 0) {
    const docsToAdd: Document[] = allChunks.map((c, i) => ({
      id: c.id,
      vector: vectors[i],
      metadata: { ...c.metadata, [TEXT_METADATA_FIELD]: c.text },
    }));

    // Add in batches
    for (let i = 0; i < docsToAdd.length; i += batchSize) {
      abortSignal?.throwIfAborted();

      const batch = docsToAdd.slice(i, i + batchSize);
      await db.addMany(batch);

      chunkIds.push(...batch.map((d) => d.id));
      progress.chunksProcessed = Math.min(i + batchSize, docsToAdd.length);
      progress.currentBatch = Math.floor(i / batchSize) + 1;
      reportProgress();
    }
  } else {
    // Just track chunk IDs without adding to DB (user will add vectors later)
    for (const c of allChunks) {
      chunkIds.push(c.id);
    }
    progress.chunksProcessed = allChunks.length;
    progress.currentBatch = progress.totalBatches;
    reportProgress();
  }

  // Complete
  progress.phase = 'complete';
  reportProgress();

  return {
    documentsProcessed: documents.length,
    chunksCreated: allChunks.length,
    chunkIds,
    bm25Index,
    duration: Date.now() - startTime,
  };
}

/**
 * Chunk documents without ingesting into the database.
 *
 * Useful when you want to prepare chunks for manual processing.
 *
 * @param documents - Source documents
 * @param options - Chunking options
 * @returns Array of chunks with metadata
 *
 * @example
 * ```typescript
 * import { chunkDocuments } from '@localmode/core';
 *
 * const chunks = chunkDocuments(documents, {
 *   chunking: { strategy: 'markdown', size: 500 },
 * });
 *
 * // Process chunks manually
 * for (const chunk of chunks) {
 *   const embedding = await embedder.embed(chunk.text);
 *   // ...
 * }
 * ```
 */
export function chunkDocuments(
  documents: SourceDocument[],
  options: { chunking?: ChunkOptions; idPrefix?: string } = {}
): Array<{
  id: string;
  text: string;
  sourceDocId: string;
  chunkIndex: number;
  start: number;
  end: number;
  metadata?: Record<string, unknown>;
}> {
  const { chunking = { strategy: 'recursive' }, idPrefix = 'chunk' } = options;

  const allChunks: Array<{
    id: string;
    text: string;
    sourceDocId: string;
    chunkIndex: number;
    start: number;
    end: number;
    metadata?: Record<string, unknown>;
  }> = [];

  for (const doc of documents) {
    const docId = doc.id || generateDocId();
    const chunks = chunk(doc.text, chunking);

    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      allChunks.push({
        id: generateChunkId(docId, i, idPrefix),
        text: c.text,
        sourceDocId: docId,
        chunkIndex: i,
        start: c.start,
        end: c.end,
        metadata: {
          ...doc.metadata,
          ...c.metadata,
        },
      });
    }
  }

  return allChunks;
}

/**
 * Ingest pre-chunked and embedded documents.
 *
 * Use this when you've already processed chunks and embeddings externally.
 *
 * @param db - Vector database instance
 * @param chunks - Pre-processed chunks with vectors
 * @param options - Ingestion options
 * @returns Ingestion result
 *
 * @example
 * ```typescript
 * import { ingestChunks } from '@localmode/core';
 *
 * // Chunks with pre-computed embeddings
 * const chunks = [
 *   { id: 'chunk1', text: 'Hello world', vector: embedding1 },
 *   { id: 'chunk2', text: 'Goodbye world', vector: embedding2 },
 * ];
 *
 * await ingestChunks(db, chunks, {
 *   buildBM25Index: true,
 * });
 * ```
 */
export async function ingestChunks(
  db: VectorDB,
  chunks: Array<{
    id: string;
    text: string;
    vector: Float32Array;
    metadata?: Record<string, unknown>;
  }>,
  options: {
    batchSize?: number;
    onProgress?: (completed: number, total: number) => void;
    buildBM25Index?: boolean;
    bm25Options?: IngestOptions['bm25Options'];
  } = {}
): Promise<{
  chunksCreated: number;
  chunkIds: string[];
  bm25Index?: BM25Index;
  duration: number;
}> {
  const startTime = Date.now();
  const { batchSize = 100, onProgress, buildBM25Index = false, bm25Options } = options;

  const chunkIds: string[] = [];
  let bm25Index: BM25 | undefined;

  // Build BM25 index if requested
  if (buildBM25Index) {
    bm25Index = new BM25(bm25Options);
    for (const c of chunks) {
      bm25Index.add(c.id, c.text);
    }
  }

  // Add to database in batches
  const docsToAdd: Document[] = chunks.map((c) => ({
    id: c.id,
    vector: c.vector,
    metadata: { ...c.metadata, [TEXT_METADATA_FIELD]: c.text },
  }));

  for (let i = 0; i < docsToAdd.length; i += batchSize) {
    const batch = docsToAdd.slice(i, i + batchSize);
    await db.addMany(batch);

    chunkIds.push(...batch.map((d) => d.id));

    if (onProgress) {
      onProgress(Math.min(i + batchSize, docsToAdd.length), docsToAdd.length);
    }
  }

  return {
    chunksCreated: chunks.length,
    chunkIds,
    bm25Index,
    duration: Date.now() - startTime,
  };
}

/**
 * Create an ingestion pipeline with preset options.
 *
 * @param db - Vector database instance
 * @param defaultOptions - Default ingestion options
 * @returns Configured ingest function
 *
 * @example
 * ```typescript
 * import { createIngestPipeline } from '@localmode/core';
 *
 * const pipeline = createIngestPipeline(db, {
 *   chunking: { strategy: 'markdown', size: 1000 },
 *   generateEmbeddings: true,
 *   embedder: myEmbedder,
 * });
 *
 * // Now ingest multiple batches with same config
 * await pipeline(batch1);
 * await pipeline(batch2);
 * ```
 */
export function createIngestPipeline(
  db: VectorDB,
  defaultOptions: IngestOptions = {}
): (documents: SourceDocument[], options?: Partial<IngestOptions>) => Promise<IngestResult> {
  return async (documents: SourceDocument[], options: Partial<IngestOptions> = {}) =>
    ingest(db, documents, { ...defaultOptions, ...options });
}

/**
 * Estimate ingestion statistics without actually ingesting.
 *
 * @param documents - Source documents
 * @param options - Chunking options
 * @returns Estimated statistics
 *
 * @example
 * ```typescript
 * import { estimateIngestion } from '@localmode/core';
 *
 * const estimate = estimateIngestion(documents, {
 *   chunking: { strategy: 'recursive', size: 500 },
 * });
 *
 * console.log(`Will create ${estimate.estimatedChunks} chunks`);
 * ```
 */
export function estimateIngestion(
  documents: SourceDocument[],
  options: { chunking?: ChunkOptions } = {}
): {
  totalDocuments: number;
  estimatedChunks: number;
  totalCharacters: number;
  avgChunkSize: number;
} {
  const { chunking = { strategy: 'recursive' } } = options;

  let totalChunks = 0;
  let totalCharacters = 0;

  for (const doc of documents) {
    const chunks = chunk(doc.text, chunking);
    totalChunks += chunks.length;
    totalCharacters += chunks.reduce((sum, c) => sum + c.text.length, 0);
  }

  return {
    totalDocuments: documents.length,
    estimatedChunks: totalChunks,
    totalCharacters,
    avgChunkSize: totalChunks > 0 ? Math.round(totalCharacters / totalChunks) : 0,
  };
}

