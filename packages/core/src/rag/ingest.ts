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
  IngestProgress,
  IngestResult,
  ChunkOptions,
  BM25Index,
} from './types.js';
import { DEFAULT_INGEST_OPTIONS } from './types.js';
import { chunk } from './chunkers/index.js';
import { BM25 } from './bm25.js';

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
 *
 * @param db - Vector database instance
 * @param documents - Source documents to ingest
 * @param options - Ingestion configuration
 * @returns Ingestion result with statistics
 *
 * @example
 * ```typescript
 * import { createVectorDB, ingest } from '@localmode/core';
 *
 * const db = await createVectorDB({ name: 'docs', dimensions: 384 });
 *
 * // Simple ingestion with vectors already computed
 * const result = await ingest(db, documents, {
 *   chunking: { strategy: 'recursive', size: 500 },
 *   onProgress: (p) => console.log(`${p.phase}: ${p.chunksProcessed}/${p.totalChunks}`),
 * });
 *
 * // With embedding generation
 * const result = await ingest(db, documents, {
 *   generateEmbeddings: true,
 *   embedder: async (texts) => embedModel.embed(texts),
 * });
 * ```
 */
export async function ingest(
  db: VectorDB,
  documents: SourceDocument[],
  options: IngestOptions = {}
): Promise<IngestResult> {
  const startTime = Date.now();
  const {
    chunking = { strategy: 'recursive' },
    batchSize = DEFAULT_INGEST_OPTIONS.batchSize,
    onProgress,
    idPrefix = DEFAULT_INGEST_OPTIONS.idPrefix,
    generateEmbeddings = DEFAULT_INGEST_OPTIONS.generateEmbeddings,
    embedder,
    buildBM25Index = DEFAULT_INGEST_OPTIONS.buildBM25Index,
    bm25Options,
  } = options;

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
  let vectors: Float32Array[] = [];

  if (generateEmbeddings && embedder) {
    progress.phase = 'embedding';
    reportProgress();

    // Process in batches
    for (let i = 0; i < allChunks.length; i += batchSize) {
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
      metadata: { ...c.metadata, _text: c.text },
    }));

    // Add in batches
    for (let i = 0; i < docsToAdd.length; i += batchSize) {
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
    metadata: { ...c.metadata, _text: c.text },
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

