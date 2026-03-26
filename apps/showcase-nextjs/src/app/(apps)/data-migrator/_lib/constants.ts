/**
 * @file constants.ts
 * @description Constants for the data migrator application
 */

/** Embedding model for re-embedding text-only records */
export const EMBEDDING_MODEL_ID = 'Xenova/bge-small-en-v1.5';
export const EMBEDDING_MODEL_SIZE = '33MB';
export const EMBEDDING_DIMENSIONS = 384;

/** Supported file extensions */
export const SUPPORTED_EXTENSIONS = ['.json', '.jsonl', '.csv'];

/** Maximum file size (50MB) */
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** Default batch size */
export const DEFAULT_BATCH_SIZE = 100;

/** Maximum preview records */
export const MAX_PREVIEW_RECORDS = 10;

/** VectorDB name for the migrator */
export const DB_NAME = 'data-migrator-db';

/** Phase display names */
export const PHASE_LABELS: Record<string, string> = {
  parsing: 'Parsing records...',
  validating: 'Validating dimensions...',
  embedding: 'Re-embedding text records...',
  importing: 'Importing into VectorDB...',
} as const;

/** Format display labels */
export const FORMAT_LABELS: Record<string, string> = {
  pinecone: 'Pinecone JSON',
  chroma: 'ChromaDB JSON',
  csv: 'CSV with Vectors',
  jsonl: 'JSONL (Newline-delimited JSON)',
} as const;
