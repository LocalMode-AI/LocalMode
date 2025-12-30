/**
 * RAG (Retrieval-Augmented Generation) Domain Types
 *
 * Types for chunking, BM25 keyword search, hybrid search, and ingestion.
 * All types are zero-dependency and self-contained.
 *
 * @packageDocumentation
 */

import type { FilterQuery } from '../types.js';

// ═══════════════════════════════════════════════════════════════
// CHUNKING TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Chunking strategy type.
 */
export type ChunkStrategy = 'recursive' | 'markdown' | 'code' | 'sentence' | 'paragraph';

/**
 * Base configuration for all chunking strategies.
 */
export interface ChunkOptionsBase {
  /** Target size of each chunk in characters (default: 500) */
  size?: number;

  /** Overlap between chunks in characters (default: 50) */
  overlap?: number;

  /** Minimum chunk size - chunks smaller than this are merged (default: 50) */
  minSize?: number;

  /** Whether to trim whitespace from chunks (default: true) */
  trim?: boolean;

  /** Whether to keep separators in the chunks (default: false) */
  keepSeparators?: boolean;
}

/**
 * Configuration for recursive text splitting.
 */
export interface RecursiveChunkOptions extends ChunkOptionsBase {
  /** Custom separators in order of priority (default: ['\n\n', '\n', '. ', ' ']) */
  separators?: string[];
}

/**
 * Configuration for markdown-aware chunking.
 */
export interface MarkdownChunkOptions extends ChunkOptionsBase {
  /** Whether to include headers in each chunk for context (default: true) */
  includeHeaders?: boolean;

  /** Maximum header level to track (1-6, default: 3) */
  maxHeaderLevel?: number;

  /** Whether to preserve code blocks as single chunks (default: true) */
  preserveCodeBlocks?: boolean;

  /** Whether to preserve tables as single chunks (default: true) */
  preserveTables?: boolean;
}

/**
 * Supported programming languages for code-aware chunking.
 */
export type CodeLanguage =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'java'
  | 'csharp'
  | 'cpp'
  | 'go'
  | 'rust'
  | 'ruby'
  | 'php'
  | 'swift'
  | 'kotlin'
  | 'generic';

/**
 * Configuration for code-aware chunking.
 */
export interface CodeChunkOptions extends ChunkOptionsBase {
  /** Programming language (auto-detected if not specified) */
  language?: CodeLanguage;

  /** Whether to preserve function/class bodies as single chunks when possible */
  preserveBlocks?: boolean;

  /** Whether to include import statements in each chunk for context */
  includeImports?: boolean;

  /** Maximum lines per chunk (overrides size if specified) */
  maxLines?: number;
}

/**
 * Combined chunk options with strategy selection.
 */
export type ChunkOptions =
  | ({ strategy: 'recursive' } & RecursiveChunkOptions)
  | ({ strategy: 'markdown' } & MarkdownChunkOptions)
  | ({ strategy: 'code' } & CodeChunkOptions)
  | ({ strategy: 'sentence' } & ChunkOptionsBase)
  | ({ strategy: 'paragraph' } & ChunkOptionsBase);

/**
 * A single chunk of text with metadata about its position.
 */
export interface Chunk {
  /** The chunk text content */
  text: string;

  /** Character offset of the chunk start in the original text */
  start: number;

  /** Character offset of the chunk end in the original text */
  end: number;

  /** Chunk index (0-based) */
  index: number;

  /** Additional metadata from the chunking process */
  metadata?: ChunkMetadata;
}

/**
 * Metadata attached to chunks during processing.
 */
export interface ChunkMetadata {
  /** For markdown: the header path (e.g., "# Title > ## Section") */
  headerPath?: string;

  /** For markdown: header levels present (e.g., [1, 2]) */
  headerLevels?: number[];

  /** For code: the language detected or specified */
  language?: CodeLanguage;

  /** For code: the function/class name if this chunk is within one */
  scopeName?: string;

  /** For code: the scope type (function, class, method, etc.) */
  scopeType?: string;

  /** Whether this chunk contains a code block */
  isCodeBlock?: boolean;

  /** Whether this chunk contains a table */
  isTable?: boolean;
}

/**
 * Interface for a text chunker.
 */
export interface Chunker {
  /** Chunk text into smaller pieces */
  chunk(text: string, options?: ChunkOptionsBase): Chunk[];

  /** Optional: Estimate chunk count without splitting */
  estimateChunks?(text: string, options?: ChunkOptionsBase): number;
}

// ═══════════════════════════════════════════════════════════════
// BM25 / KEYWORD SEARCH TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Configuration for BM25 scoring.
 */
export interface BM25Options {
  /** Term frequency saturation parameter (default: 1.2) */
  k1?: number;

  /** Document length normalization parameter (default: 0.75) */
  b?: number;

  /** Minimum token length to index (default: 2) */
  minTokenLength?: number;

  /** Stop words to exclude from indexing */
  stopWords?: Set<string> | string[];

  /** Custom tokenizer function */
  tokenize?: (text: string) => string[];

  /** Whether to stem tokens (default: false, uses simple lowercasing) */
  stemming?: boolean;
}

/**
 * A document indexed for BM25 search.
 */
export interface BM25Document {
  /** Document ID */
  id: string;

  /** Tokenized document content */
  tokens: string[];

  /** Token frequencies */
  termFreqs: Map<string, number>;

  /** Document length (number of tokens) */
  length: number;

  /** Original text (optional, for retrieval) */
  text?: string;
}

/**
 * BM25 index state for serialization.
 */
export interface BM25IndexState {
  /** Total number of documents */
  docCount: number;

  /** Average document length */
  avgDocLength: number;

  /** Document frequency for each term */
  docFreqs: Record<string, number>;

  /** All indexed documents */
  documents: Array<{
    id: string;
    tokens: string[];
    length: number;
    text?: string;
  }>;
}

/**
 * Result from BM25 search.
 */
export interface BM25Result {
  /** Document ID */
  id: string;

  /** BM25 score */
  score: number;

  /** Original text (if stored) */
  text?: string;
}

/**
 * Interface for BM25 index.
 */
export interface BM25Index {
  /** Add a document to the index */
  add(id: string, text: string): void;

  /** Add multiple documents */
  addMany(documents: Array<{ id: string; text: string }>): void;

  /** Search the index */
  search(query: string, k?: number): BM25Result[];

  /** Remove a document from the index */
  remove(id: string): void;

  /** Clear the index */
  clear(): void;

  /** Get index statistics */
  stats(): { docCount: number; avgDocLength: number; vocabularySize: number };

  /** Serialize the index to JSON */
  toJSON(): BM25IndexState;

  /** Load from serialized state */
  fromJSON(state: BM25IndexState): void;
}

// ═══════════════════════════════════════════════════════════════
// HYBRID SEARCH TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Result from vector search (for hybrid search input).
 */
export interface VectorSearchResult {
  /** Document ID */
  id: string;

  /** Similarity score (0-1) */
  score: number;

  /** Document metadata */
  metadata?: Record<string, unknown>;

  /** Document vector (if requested) */
  vector?: Float32Array;
}

/**
 * Configuration for hybrid search.
 */
export interface HybridSearchOptions {
  /** Number of results to return (default: 10) */
  k?: number;

  /** Weight for vector search scores (0-1, default: 0.7) */
  vectorWeight?: number;

  /** Weight for keyword/BM25 scores (0-1, default: 0.3) */
  keywordWeight?: number;

  /** Whether to normalize scores before combining (default: true) */
  normalizeScores?: boolean;

  /** Minimum score threshold for final results */
  threshold?: number;

  /** Metadata filter to apply */
  filter?: FilterQuery;

  /** Whether to include vectors in results (default: false) */
  includeVectors?: boolean;

  /** Number of candidates to fetch from each search before combining (default: k * 3) */
  fetchK?: number;

  /** BM25 configuration */
  bm25Options?: BM25Options;
}

/**
 * Result from hybrid search.
 */
export interface HybridSearchResult extends VectorSearchResult {
  /** Vector similarity score (before weighting) */
  vectorScore?: number;

  /** BM25/keyword score (before weighting) */
  keywordScore?: number;

  /** Text content (if stored) */
  text?: string;
}

/**
 * Options for the reciprocalRankFusion function.
 */
export interface RRFOptions {
  /** RRF constant k (default: 60) */
  k?: number;

  /** Number of results to return */
  topK?: number;
}

// ═══════════════════════════════════════════════════════════════
// INGESTION TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * A source document for ingestion.
 */
export interface SourceDocument {
  /** Unique identifier (auto-generated if not provided) */
  id?: string;

  /** Text content to chunk and ingest */
  text: string;

  /** Metadata to attach to all chunks from this document */
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for batch ingestion.
 */
export interface IngestOptions {
  /** Chunking configuration */
  chunking?: ChunkOptions | { strategy: ChunkStrategy };

  /** Batch size for database operations (default: 100) */
  batchSize?: number;

  /** Progress callback */
  onProgress?: (progress: IngestProgress) => void;

  /** ID prefix for generated chunk IDs */
  idPrefix?: string;

  /** Whether to generate embeddings */
  generateEmbeddings?: boolean;

  /** Custom embedder function (if generateEmbeddings is true) */
  embedder?: (texts: string[]) => Promise<Float32Array[]>;

  /** Whether to build BM25 index for hybrid search (default: false) */
  buildBM25Index?: boolean;

  /** BM25 configuration (if buildBM25Index is true) */
  bm25Options?: BM25Options;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;
}

/**
 * Progress information during ingestion.
 */
export interface IngestProgress {
  /** Current phase */
  phase: 'chunking' | 'embedding' | 'indexing' | 'complete';

  /** Documents processed so far */
  documentsProcessed: number;

  /** Total documents to process */
  totalDocuments: number;

  /** Chunks processed so far */
  chunksProcessed: number;

  /** Total chunks generated */
  totalChunks: number;

  /** Current batch number */
  currentBatch: number;

  /** Total batches */
  totalBatches: number;
}

/**
 * Result from ingestion.
 */
export interface IngestResult {
  /** Number of source documents processed */
  documentsProcessed: number;

  /** Number of chunks created */
  chunksCreated: number;

  /** IDs of created chunks */
  chunkIds: string[];

  /** BM25 index (if buildBM25Index was true) */
  bm25Index?: BM25Index;

  /** Time taken in milliseconds */
  duration: number;
}

// ═══════════════════════════════════════════════════════════════
// DOCUMENT LOADER TYPES (Re-exported from loaders module)
// ═══════════════════════════════════════════════════════════════

export type {
  LoaderSource,
  LoadedDocument,
  LoaderOptions,
  LoaderResult,
  DocumentLoader,
} from '../loaders/types.js';

// ═══════════════════════════════════════════════════════════════
// DEFAULT CONFIGURATION
// ═══════════════════════════════════════════════════════════════

/**
 * Default chunking options.
 */
export const DEFAULT_CHUNK_OPTIONS: Required<ChunkOptionsBase> = {
  size: 500,
  overlap: 50,
  minSize: 50,
  trim: true,
  keepSeparators: false,
};

/**
 * Default recursive chunking separators.
 */
export const DEFAULT_RECURSIVE_SEPARATORS = [
  '\n\n\n', // Multiple blank lines
  '\n\n', // Paragraphs
  '\n', // Lines
  '. ', // Sentences
  '? ', // Questions
  '! ', // Exclamations
  '; ', // Semicolons
  ', ', // Commas
  ' ', // Words
  '', // Characters (last resort)
];

/**
 * Default BM25 options.
 */
export const DEFAULT_BM25_OPTIONS: Required<Omit<BM25Options, 'tokenize' | 'stopWords'>> = {
  k1: 1.2,
  b: 0.75,
  minTokenLength: 2,
  stemming: false,
};

/**
 * Default English stop words.
 */
export const ENGLISH_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'he',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'that',
  'the',
  'to',
  'was',
  'were',
  'will',
  'with',
  'the',
  'this',
  'but',
  'they',
  'have',
  'had',
  'what',
  'when',
  'where',
  'who',
  'which',
  'why',
  'how',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'can',
  'just',
  'should',
  'now',
  'i',
  'you',
  'your',
  'we',
  'our',
  'my',
  'me',
  'him',
  'her',
]);

/**
 * Default hybrid search options.
 */
export const DEFAULT_HYBRID_OPTIONS: Required<Omit<HybridSearchOptions, 'filter' | 'bm25Options'>> =
  {
    k: 10,
    vectorWeight: 0.7,
    keywordWeight: 0.3,
    normalizeScores: true,
    threshold: 0,
    includeVectors: false,
    fetchK: 30,
  };

/**
 * Default ingest options.
 */
export const DEFAULT_INGEST_OPTIONS = {
  batchSize: 100,
  idPrefix: 'chunk',
  generateEmbeddings: false,
  buildBM25Index: false,
};
