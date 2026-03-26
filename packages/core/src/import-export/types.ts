/**
 * Import/Export Types
 *
 * Type definitions for vector data import/export operations.
 * Supports Pinecone, ChromaDB, CSV, and JSONL formats.
 *
 * @packageDocumentation
 */

import type { EmbeddingModel } from '../embeddings/types.js';

// ============================================================================
// Core Types
// ============================================================================

/**
 * Supported external vector database formats.
 */
export type ExternalFormat = 'pinecone' | 'chroma' | 'csv' | 'jsonl';

/**
 * Common intermediate representation for imported vector records.
 *
 * All parsers produce `ImportRecord[]` — a normalized shape that the
 * orchestrator (`importFrom`) can validate, re-embed, and insert.
 *
 * @example
 * ```ts
 * const record: ImportRecord = {
 *   id: 'doc-1',
 *   vector: new Float32Array([0.1, 0.2, 0.3]),
 *   text: 'Hello world',
 *   metadata: { category: 'greeting' },
 * };
 * ```
 */
export interface ImportRecord {
  /** Unique record identifier */
  id: string;
  /** Embedding vector (absent for text-only records) */
  vector?: Float32Array;
  /** Source text (for re-embedding or display) */
  text?: string;
  /** Metadata key-value pairs */
  metadata?: Record<string, unknown>;
}

/**
 * Result of parsing external format data.
 *
 * Contains the parsed records along with summary statistics
 * useful for preview and validation before importing.
 */
export interface ParseResult {
  /** Parsed records */
  records: ImportRecord[];
  /** Detected or specified format */
  format: ExternalFormat;
  /** Total number of records parsed */
  totalRecords: number;
  /** Number of records that have a vector */
  recordsWithVectors: number;
  /** Number of records that have text but no vector */
  recordsWithTextOnly: number;
  /** Detected vector dimensions (null if no vectors present) */
  dimensions: number | null;
}

// ============================================================================
// Import Options & Stats
// ============================================================================

/**
 * Progress information for multi-phase import operations.
 */
export interface ImportProgress {
  /** Current phase of the import */
  phase: 'parsing' | 'validating' | 'embedding' | 'importing';
  /** Records completed in the current phase */
  completed: number;
  /** Total records in the current phase */
  total: number;
  /** Total records processed across all phases */
  overallCompleted: number;
  /** Total records across all phases */
  overallTotal: number;
}

/**
 * Options for `importFrom()` orchestrator function.
 */
export interface ImportFromOptions {
  /** Target VectorDB instance */
  db: {
    readonly dimensions: number;
    addMany(docs: Array<{ id: string; vector: Float32Array; metadata?: Record<string, unknown> }>): Promise<void>;
  };
  /** Raw content string to parse */
  content: string;
  /** Source format (auto-detected if omitted) */
  format?: ExternalFormat;
  /** Embedding model for re-embedding text-only records */
  model?: EmbeddingModel;
  /** Number of records per addMany() call (default: 100) */
  batchSize?: number;
  /** Skip dimension validation (default: false) */
  skipDimensionCheck?: boolean;
  /** Progress callback */
  onProgress?: (progress: ImportProgress) => void;
  /** Cancellation signal */
  abortSignal?: AbortSignal;
}

/**
 * Statistics returned by `importFrom()` after completion.
 */
export interface ImportStats {
  /** Records successfully imported into VectorDB */
  imported: number;
  /** Records skipped (text-only without model, or no vector and no text) */
  skipped: number;
  /** Text-only records that were re-embedded before import */
  reEmbedded: number;
  /** Total records parsed from source */
  totalParsed: number;
  /** Detected or specified source format */
  format: ExternalFormat;
  /** Vector dimensions of imported records */
  dimensions: number;
  /** Total operation time in milliseconds */
  durationMs: number;
}

// ============================================================================
// Export Options
// ============================================================================

/**
 * Options for CSV export serialization.
 */
export interface ExportToCSVOptions {
  /** Column delimiter (default: ',') */
  delimiter?: string;
  /** Whether to include the vector column (default: true) */
  includeVectors?: boolean;
  /** Whether to include the text column (default: true) */
  includeText?: boolean;
}

/**
 * Options for JSONL export serialization.
 */
export interface ExportToJSONLOptions {
  /** Whether to include the vector field (default: true) */
  includeVectors?: boolean;
  /** Whether to include the text field (default: true) */
  includeText?: boolean;
  /** Name of the vector field in output (default: 'vector') */
  vectorFieldName?: string;
}

// ============================================================================
// Convert Options
// ============================================================================

/**
 * Options for format-to-format conversion.
 */
export interface ConvertOptions {
  /** Source format (auto-detected if omitted) */
  from?: ExternalFormat;
  /** Target format (required) */
  to: ExternalFormat;
  /** Options passed to CSV serializer when `to` is 'csv' */
  csvOptions?: ExportToCSVOptions;
  /** Options passed to JSONL serializer when `to` is 'jsonl' */
  jsonlOptions?: ExportToJSONLOptions;
}

// ============================================================================
// CSV Parse Options
// ============================================================================

/**
 * Options for CSV vector parsing.
 */
export interface CSVParseOptions {
  /** Column delimiter (default: ',') */
  delimiter?: string;
  /** Name of the vector column (auto-detected if omitted) */
  vectorColumn?: string;
  /** Name of the ID column (auto-detected if omitted) */
  idColumn?: string;
  /** Name of the text column (auto-detected if omitted) */
  textColumn?: string;
}
