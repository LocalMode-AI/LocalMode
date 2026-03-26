/**
 * @file types.ts
 * @description Type definitions for the semantic search application
 */

/** A note stored in the vector database */
export interface Note {
  /** Unique note identifier */
  id: string;
  /** Note text content */
  text: string;
  /** When the note was created */
  createdAt: Date;
}

/** A search result with similarity score */
export interface SearchResult {
  /** The matched note */
  note: Note;
  /** Similarity score (0-1, higher is more similar) */
  score: number;
  /** Chunk index within the parent note (present when chunking is active) */
  chunkIndex?: number;
  /** Total chunks in the parent note (present when chunking is active) */
  totalChunks?: number;
  /** The matched chunk text (present when chunking is active) */
  chunkText?: string;
}

/** Chunking mode for text splitting before embedding */
export type ChunkingMode = 'off' | 'recursive' | 'semantic';

/** Information about a single chunk belonging to a note */
export interface ChunkInfo {
  /** Parent note ID */
  noteId: string;
  /** 0-based chunk position within the parent note */
  chunkIndex: number;
  /** Total number of chunks for the parent note */
  totalChunks: number;
  /** Chunk text content */
  text: string;
  /** Left boundary similarity score (semantic mode only, null for first chunk) */
  leftSimilarity?: number | null;
  /** Right boundary similarity score (semantic mode only, null for last chunk) */
  rightSimilarity?: number | null;
}

/** Aggregate statistics for chunks in the VectorDB */
export interface ChunkStats {
  /** Total number of chunks stored in the VectorDB */
  totalChunks: number;
  /** Average chunk size in characters */
  avgChunkSize: number;
  /** Average number of chunks per note */
  avgChunksPerNote: number;
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

/** An embedding model option for the model picker */
export interface ModelOption {
  /** Model identifier (e.g., 'Xenova/all-MiniLM-L6-v2') */
  id: string;
  /** Display label (e.g., 'MiniLM-L6') */
  label: string;
  /** Output embedding dimensions */
  dimensions: number;
  /** Approximate download size (e.g., '23MB') */
  size: string;
}

/** Quantization type for VectorDB storage */
export type QuantizationType = 'none' | 'scalar' | 'pq';

/** Export format for notes */
export type ExportFormat = 'json' | 'csv' | 'jsonl';

/** Latency measurement from a search operation */
export interface SearchLatency {
  /** Search query duration in milliseconds */
  queryMs: number;
  /** Whether GPU acceleration was enabled for this search */
  gpuEnabled: boolean;
}

/** Drift warning state from model compatibility check */
export interface DriftWarning {
  /** Compatibility status ('incompatible' or 'dimension-mismatch') */
  status: 'incompatible' | 'dimension-mismatch';
  /** Model that originally embedded the stored vectors */
  storedModelId: string;
  /** Currently selected model */
  currentModelId: string;
  /** Number of documents affected */
  documentCount: number;
}

/** Presentation-layer subset of ParseResult for the import preview UI */
export interface ImportPreviewData {
  /** Detected source format (e.g., 'pinecone', 'chroma', 'csv', 'jsonl') */
  format: string;
  /** Total number of records parsed */
  totalRecords: number;
  /** Records that already have embedding vectors */
  recordsWithVectors: number;
  /** Records with text but no vector (will be re-embedded) */
  recordsWithTextOnly: number;
  /** Detected vector dimensions, or null if no vectors present */
  dimensions: number | null;
}
