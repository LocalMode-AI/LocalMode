/**
 * @file types.ts
 * @description Type definitions for the PDF chat application
 */

/** Message role in a chat conversation */
export type MessageRole = 'user' | 'assistant' | 'system';

/** Chat message representing a single message in conversation */
export interface ChatMessage {
  /** Unique message identifier */
  id: string;
  /** Who sent the message */
  role: MessageRole;
  /** Message content */
  content: string;
  /** When the message was created */
  timestamp: Date;
}

/** PDF document chunk with embedding */
export interface DocumentChunk {
  /** Unique chunk identifier */
  id: string;
  /** Text content of the chunk */
  text: string;
  /** Page number in the PDF */
  pageNumber: number;
  /** Chunk index in document */
  chunkIndex: number;
  /** Document ID this chunk belongs to */
  documentId: string;
}

/** PDF document metadata */
export interface DocumentMetadata {
  /** Original filename */
  filename: string;
  /** File size in bytes */
  fileSize: number;
  /** Number of pages */
  pageCount: number;
  /** Upload timestamp */
  uploadedAt: Date;
}

/** Processed PDF document */
export interface PDFDocument {
  /** Unique document identifier */
  id: string;
  /** Original filename */
  filename: string;
  /** Document metadata */
  metadata: DocumentMetadata;
  /** Document chunks with embeddings */
  chunks: DocumentChunk[];
}

/** Search result from vector database */
export interface SearchResult {
  /** Chunk text content */
  text: string;
  /** Similarity score (0-1) */
  score: number;
  /** Result metadata */
  metadata: {
    /** Source filename */
    filename: string;
    /** Page number */
    page: number;
    /** Chunk index */
    chunkIndex: number;
  };
}

/** Model loading progress */
export interface ModelProgress {
  /** Progress percentage (0-100) */
  progress: number;
  /** Current status message */
  status: string;
}

/** Model state */
export interface ModelState {
  /** Whether model is loaded and ready */
  isReady: boolean;
  /** Whether model is currently loading */
  isLoading: boolean;
  /** Loading progress percentage */
  progress: number;
  /** Error message if any */
  error: string | null;
}

/** Application error for UI display */
export interface AppError {
  /** Error message for display */
  message: string;
  /** Error code for programmatic handling */
  code?: string;
  /** Whether the error is recoverable */
  recoverable?: boolean;
}

/**
 * Typed metadata stored with each vector in the VectorDB.
 * Enables type-safe filters and autocomplete on search results.
 */
export interface PdfChunkMetadata extends Record<string, unknown> {
  /** Full text content of the chunk */
  text: string;
  /** Source PDF filename */
  filename: string;
  /** Page number in the source PDF */
  pageNumber: number;
  /** Index of this chunk within the document */
  chunkIndex: number;
  /** ID of the parent document (for deletion) */
  documentId: string;
}

/** Chunking strategy for PDF text processing */
export type ChunkingStrategy = 'semantic' | 'recursive';

/** Compression statistics for display in the sidebar */
export interface CompressionDisplayStats {
  /** Number of vectors stored */
  vectorCount: number;
  /** Original (uncompressed) size in bytes */
  originalSize: number;
  /** Compressed size in bytes */
  compressedSize: number;
  /** Compression ratio (e.g., 4.0 means 4x smaller) */
  ratio: number;
}

/** Threshold information for search relevance filtering */
export interface ThresholdInfo {
  /** The similarity threshold value (0-1) */
  value: number;
  /** Whether this is a model preset or calibrated from the corpus */
  source: 'preset' | 'calibrated';
  /** Number of samples used during calibration (only present when source is 'calibrated') */
  sampleSize?: number;
}

/** Pipeline stage names for progress display */
export type PipelineStage =
  | 'extracting'
  | 'chunking'
  | 'semantic-chunking'
  | 'embedding'
  | 'storing'
  | 'complete';
