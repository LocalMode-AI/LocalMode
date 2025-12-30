/**
 * RAG (Retrieval-Augmented Generation) Domain
 *
 * Types and utilities for chunking, BM25 keyword search,
 * hybrid search, and document ingestion.
 *
 * @packageDocumentation
 */

// ============================================================================
// Types
// ============================================================================

export * from './types.js';

// ============================================================================
// Chunking
// ============================================================================

export {
  chunk,
  createChunker,
  estimateChunkCount,
  getChunkStats,
  recursiveChunk,
  createRecursiveChunker,
  markdownChunk,
  createMarkdownChunker,
  codeChunk,
  createCodeChunker,
} from './chunkers/index.js';

// ============================================================================
// BM25 Keyword Search
// ============================================================================

export { BM25, createBM25, createBM25FromDocuments } from './bm25.js';

// ============================================================================
// Hybrid Search
// ============================================================================

export {
  HybridSearch,
  createHybridSearch,
  hybridFuse,
  reciprocalRankFusion,
} from './hybrid.js';

// ============================================================================
// Ingestion
// ============================================================================

export {
  ingest,
  chunkDocuments,
  ingestChunks,
  createIngestPipeline,
  estimateIngestion,
} from './ingest.js';

