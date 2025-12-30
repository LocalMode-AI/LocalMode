/**
 * @file constants.ts
 * @description App constants and configuration for PDF search
 */

/** Model IDs for transformers */
export const MODELS = {
  /** Embedding model for semantic search */
  EMBEDDING: 'Xenova/all-MiniLM-L6-v2',
  /** Reranker model for improving search results */
  RERANKER: 'Xenova/ms-marco-MiniLM-L-6-v2',
} as const;

/** Model sizes for display */
export const MODEL_SIZES = {
  [MODELS.EMBEDDING]: '22MB',
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
  /** Minimum similarity score for results */
  minScore: 0.1,
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
