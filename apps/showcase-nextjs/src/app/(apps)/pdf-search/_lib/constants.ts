/**
 * @file constants.ts
 * @description App constants and configuration for PDF search
 */

/** Model IDs for transformers */
export const MODELS = {
  /** Embedding model for semantic search */
  EMBEDDING: 'Xenova/bge-small-en-v1.5',
  /** Reranker model for improving search results */
  RERANKER: 'Xenova/ms-marco-MiniLM-L-6-v2',
} as const;

/** Model sizes for display */
export const MODEL_SIZES = {
  [MODELS.EMBEDDING]: '33MB',
  [MODELS.RERANKER]: '22MB',
} as const;

/** PDF processing configuration */
export const PDF_CONFIG = {
  /** Maximum file size in bytes (10MB) */
  maxFileSize: 10 * 1024 * 1024,
  /** Chunk size in characters (larger for better semantic context) */
  chunkSize: 800,
  /** Overlap between chunks (increased for better context preservation) */
  chunkOverlap: 150,
  /** Vector database name */
  dbName: 'pdf-search-db',
  /** Collection name for documents */
  collectionName: 'documents',
} as const;

/** Search configuration */
export const SEARCH_CONFIG = {
  /** Default number of results to return */
  defaultTopK: 5,
  /** Maximum number of results */
  maxTopK: 20,
  /** Minimum similarity score for results (overridden by threshold) */
  minScore: 0.1,
} as const;

/** Chunking strategy labels for display */
export const CHUNKING_STRATEGIES = {
  semantic: { label: 'Semantic', description: 'Topic-boundary aware splitting' },
  recursive: { label: 'Recursive', description: 'Fixed-size character splitting' },
} as const;

/** Threshold calibration defaults */
export const THRESHOLD_DEFAULTS = {
  /** Default threshold from model presets (bge-small-en-v1.5) */
  presetValue: 0.5,
  /** Percentile for calibration (90th percentile of pairwise similarity) */
  calibrationPercentile: 90,
  /** Maximum samples for calibration to cap computation */
  calibrationMaxSamples: 100,
} as const;

/** Storage keys for persistence */
export const STORAGE_KEYS = {
  /** PDF store persistence key */
  pdf: 'pdf-search-storage',
  /** Chat store persistence key */
  chat: 'pdf-search-messages',
  /** UI store persistence key */
  ui: 'pdf-search-ui',
} as const;

/** Accepted file types for PDF upload */
export const ACCEPTED_FILE_TYPES = ['.pdf', 'application/pdf'] as const;

/** Pipeline step display names */
export const PIPELINE_STAGES: Record<string, string> = {
  extracting: 'Extracting text...',
  chunking: 'Chunking text...',
  'semantic-chunking': 'Semantic chunking...',
  embedding: 'Embedding chunks...',
  storing: 'Storing vectors...',
  complete: 'Complete!',
};

/** Inference queue configuration */
export const QUEUE_CONFIG = {
  /** Single model at a time */
  concurrency: 1,
  /** Priority levels: interactive search > background indexing */
  priorities: ['interactive', 'background'] as string[],
} as const;
