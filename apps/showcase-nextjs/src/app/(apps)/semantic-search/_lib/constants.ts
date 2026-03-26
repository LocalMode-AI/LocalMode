/**
 * @file constants.ts
 * @description Constants for the semantic search application
 */
import type { ModelOption, QuantizationType, ExportFormat, ChunkingMode } from './types';

/** Option entry for quantization type dropdown */
interface QuantizationOption {
  /** Quantization type value */
  value: QuantizationType;
  /** Display label */
  label: string;
  /** Short description */
  description: string;
  /** Compression ratio label */
  compression: string;
}

/** Option entry for export format dropdown */
interface ExportFormatOption {
  /** Export format value */
  value: ExportFormat;
  /** Display label */
  label: string;
  /** File extension */
  ext: string;
}

/** Option entry for chunking mode dropdown */
interface ChunkingModeOption {
  /** Chunking mode value */
  value: ChunkingMode;
  /** Display label */
  label: string;
  /** Short description */
  description: string;
}

/** Available chunking modes for the chunking mode picker */
export const CHUNKING_MODE_OPTIONS: ChunkingModeOption[] = [
  { value: 'off', label: 'Off', description: 'One vector per note (no splitting)' },
  { value: 'recursive', label: 'Recursive', description: 'Fixed-size character splits with overlap' },
  { value: 'semantic', label: 'Semantic', description: 'Embedding-aware topic-boundary splits' },
];

/** Default chunk size for recursive chunking (characters) */
export const RECURSIVE_CHUNK_SIZE = 200;

/** Default overlap for recursive chunking (characters) */
export const RECURSIVE_CHUNK_OVERLAP = 20;

/** Default max chunk size for semantic chunking (characters) */
export const SEMANTIC_CHUNK_SIZE = 500;

/** Available quantization types for the quantization picker */
export const QUANTIZATION_OPTIONS: QuantizationOption[] = [
  { value: 'none', label: 'None', description: 'Raw Float32 vectors', compression: '1x' },
  { value: 'scalar', label: 'SQ8 -- Scalar', description: 'Uint8, 4x compression, >95% recall', compression: '4x' },
  { value: 'pq', label: 'PQ -- Product', description: 'Centroid indices, 8-32x compression, ~90% recall', compression: '8-32x' },
];

/** Available export formats for the export picker */
export const EXPORT_FORMAT_OPTIONS: ExportFormatOption[] = [
  { value: 'json', label: 'JSON (with vectors)', ext: '.json' },
  { value: 'csv', label: 'CSV (text only)', ext: '.csv' },
  { value: 'jsonl', label: 'JSONL (text only)', ext: '.jsonl' },
];

/** Available embedding models for the model picker */
export const MODEL_OPTIONS: ModelOption[] = [
  { id: 'Xenova/all-MiniLM-L6-v2', label: 'MiniLM-L6', dimensions: 384, size: '23MB' },
  { id: 'Xenova/bge-small-en-v1.5', label: 'BGE-small', dimensions: 384, size: '33MB' },
];

/** Embedding model ID for semantic search (default) */
export const MODEL_ID = MODEL_OPTIONS[0].id;

/** Embedding model download size */
export const MODEL_SIZE = MODEL_OPTIONS[0].size;

/** VectorDB database name */
export const DB_NAME = 'semantic-search-db';

/** VectorDB collection name */
export const COLLECTION_NAME = 'notes';

/** Embedding dimensions for the default model */
export const EMBEDDING_DIMENSIONS = MODEL_OPTIONS[0].dimensions;

/** Default number of search results to return */
export const DEFAULT_TOP_K = 10;

/** Storage key for persistence */
export const STORAGE_KEY = 'semantic-search-storage';

/** Accepted file extensions for the import file picker */
export const ACCEPTED_IMPORT_TYPES = '.json,.csv,.jsonl';

/** Accepted MIME types for import file validation */
export const ACCEPTED_IMPORT_MIMES = [
  'application/json',
  'text/csv',
  'application/jsonl',
  'text/plain',
];

/** Maximum import file size in bytes (10MB) */
export const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024;

/** Base filename for import/export operations */
export const EXPORT_FILENAME = 'knowledge-base';

/** Sample notes for quick demo */
export const SAMPLE_NOTES = [
  'Machine learning models can run directly in the browser using WebAssembly.',
  'React Server Components allow rendering on the server without sending JavaScript to the client.',
  'IndexedDB provides persistent storage in the browser for large amounts of structured data.',
  'WebGPU is the successor to WebGL and enables high-performance GPU computing in browsers.',
  'TypeScript adds static type checking to JavaScript, catching errors at compile time.',
  'Vector databases enable semantic search by finding similar items based on meaning, not just keywords.',
  'The evolution of web browsers has been remarkable. Early browsers could only render static HTML pages with basic formatting. JavaScript was introduced in 1995 to add interactivity, but it was slow and limited. Today, modern browsers include sophisticated engines that can run complex applications. WebAssembly lets developers compile C++ and Rust code to run at near-native speed. WebGPU provides access to the GPU for parallel computation. IndexedDB and the Cache API enable offline-first applications that work without a network connection. Service Workers intercept network requests and serve cached responses. These capabilities have transformed the browser from a simple document viewer into a powerful application platform.',
] as const;
