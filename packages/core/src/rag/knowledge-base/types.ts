/**
 * @file types.ts
 * @description The FROZEN `KnowledgeBaseEngine` contract and its supporting
 * types. Two engines implement this one interface over shared stores: the
 * provider-agnostic core engine ({@link createKnowledgeBaseEngine}, `kind:
 * 'core'`) and the LangChain engine (`@localmode/langchain`'s
 * `createLangChainKnowledgeBaseEngine`, `kind: 'langchain'`).
 *
 * A knowledge base session (a consuming block or the `useKnowledgeBase` React
 * hook) owns a raw-document store and re-ingests it through the selected engine
 * on an engine-kind toggle OR an embedding-model switch; search/ask then run
 * through that engine's stack.
 *
 * Additive-only: every builder codes against these shapes, so existing fields
 * never change meaning — new optional fields may be added, nothing removed.
 */

/** Chunking strategies a knowledge base surfaces at ingest time. */
export type ChunkingMode = 'off' | 'recursive' | 'semantic';

/**
 * Where a raw document came from. Drives per-source metadata and attribution
 * (e.g. `'pdf'` enables page attribution).
 */
export type DocumentSource = 'text' | 'sample' | 'pdf' | 'ocr' | 'import';

/** A raw (pre-chunking) document held in the shared raw-document store. */
export interface RawDocument {
  /** Stable id (uuid). Chunk vector ids are derived as `${id}:${chunkIndex}`. */
  id: string;
  /** Display title (filename, sample title, or first-line derivation). */
  title: string;
  /** Full extracted text. */
  text: string;
  /** Origin lane. */
  source: DocumentSource;
  /** Optional category label (sample corpus carries these; drives facets). */
  category?: string;
  /** PDF page count / OCR model id / import format — lane-specific extras. */
  meta?: Record<string, string | number>;
  /** Per-page text with page numbers (PDF lane; enables page attribution). */
  pages?: Array<{ page: number; text: string }>;
  /** Epoch milliseconds the document was added to the store. */
  addedAt: number;
}

/** Chunk-level metadata stored alongside every vector in the VectorDB. */
export interface ChunkMetadata {
  /** Id of the {@link RawDocument} this chunk was derived from. */
  docId: string;
  /** Display title of the source document. */
  docTitle: string;
  /** 0-based index of the chunk within its source document. */
  chunkIndex: number;
  /** Chunk text (stored for result rendering + rerank + ask grounding). */
  text: string;
  /** Category inherited from the source document, when present. */
  category?: string;
  /** Origin lane inherited from the source document. */
  source: DocumentSource;
  /** 1-based PDF page the chunk starts on, when known. */
  page?: number;
  /** Index signature — engines may carry additional stored fields. */
  [key: string]: unknown;
}

/** One search hit surfaced to a knowledge base's search/ask surfaces. */
export interface KBSearchResult {
  /** Contract id, reconstructed as `${docId}:${chunkIndex}`. */
  id: string;
  /** Vector similarity score (cosine, higher-is-better, in `[0, 1]`). */
  score: number;
  /** Present after an optional rerank stage (raw vector score kept in `score`). */
  rerankScore?: number;
  /** Full chunk metadata for the hit. */
  metadata: ChunkMetadata;
}

/** Options for {@link KnowledgeBaseEngine.ingest}. */
export interface IngestOptions {
  /** Chunking strategy to apply to every document. */
  chunking: ChunkingMode;
  /** Recursive-chunker size (chars); semantic mode derives its own windows. */
  chunkSize?: number;
  /** Recursive-chunker overlap (chars). */
  chunkOverlap?: number;
  /** Phase-scoped progress callback (`chunk` → `embed` → `store`). */
  onProgress?: (p: {
    phase: 'chunk' | 'embed' | 'store';
    completed: number;
    total: number;
  }) => void;
  /** Cancellation signal — honored between chunking/embedding phases. */
  abortSignal?: AbortSignal;
}

/** Options for {@link KnowledgeBaseEngine.search}. */
export interface SearchOptions {
  /** Number of hits to return. */
  topK: number;
  /**
   * Metadata filter passed to the vector store. Over-fetch (e.g. `topK × 3`)
   * for a downstream rerank stage is the caller's responsibility.
   */
  filter?: Record<string, unknown>;
  /** Minimum vector score a hit must reach to be returned. */
  minScore?: number;
  /** Cancellation signal. */
  abortSignal?: AbortSignal;
}

/** Options for {@link KnowledgeBaseEngine.ask}. */
export interface AskOptions {
  /** Retrieval depth for grounding chunks (engine default applies when unset). */
  topK?: number;
  /** Streaming token callback (reasoning tags are filtered before emission). */
  onToken?: (text: string) => void;
  /** Cancellation signal. */
  abortSignal?: AbortSignal;
}

/** Result of {@link KnowledgeBaseEngine.ask}. */
export interface AskResult {
  /** The grounded answer, with `<think>…</think>` reasoning stripped. */
  answer: string;
  /** The retrieved chunks the answer was grounded on, best-first. */
  sources: KBSearchResult[];
  /** Wall-clock generation time in milliseconds. */
  durationMs: number;
}

/** Snapshot of a knowledge base engine's indexed corpus. */
export interface EngineStats {
  /** Number of distinct documents currently indexed. */
  documents: number;
  /** Total number of chunk vectors currently indexed. */
  chunks: number;
  /** Embedding dimensionality of the active model. */
  dimensions: number;
}

/**
 * The frozen knowledge base engine contract. `kind` identifies the active
 * implementation; both the core engine and the LangChain engine operate over
 * their own session-scoped stores and expose exactly this shape.
 *
 * @see {@link createKnowledgeBaseEngine} for the provider-agnostic core engine.
 */
export interface KnowledgeBaseEngine {
  /** Which implementation is active. */
  readonly kind: 'core' | 'langchain';
  /** (Re-)ingest the given raw documents (chunk → embed → store). */
  ingest(docs: RawDocument[], opts: IngestOptions): Promise<{ chunks: number }>;
  /** Vector search over the indexed corpus. */
  search(query: string, opts: SearchOptions): Promise<KBSearchResult[]>;
  /** Grounded RAG answer (retrieve → generate, reasoning tags stripped). */
  ask(question: string, opts?: AskOptions): Promise<AskResult>;
  /** Remove a document's chunks (`deleteWhere({ docId })`). */
  removeDocument(docId: string): Promise<void>;
  /** Drop every chunk (the raw-document store is cleared by the session). */
  clear(): Promise<void>;
  /** Snapshot of the indexed corpus. */
  stats(): Promise<EngineStats>;
}
