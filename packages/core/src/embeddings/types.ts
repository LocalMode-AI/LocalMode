/**
 * Embeddings Domain Types
 *
 * Embedding interfaces for vector generation and similarity search.
 * All interfaces defined here, implementations in provider packages.
 *
 * @packageDocumentation
 */

// ═══════════════════════════════════════════════════════════════
// EMBEDDING MODEL INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Interface for embedding models.
 * Implement this to create custom embedding providers.
 *
 * @example Custom implementation
 * ```ts
 * class MyEmbedder implements EmbeddingModel {
 *   readonly modelId = 'custom:my-embedder';
 *   readonly provider = 'custom';
 *   readonly dimensions = 384;
 *   readonly maxEmbeddingsPerCall = 100;
 *   readonly supportsParallelCalls = true;
 *
 *   async doEmbed(options) {
 *     // Your implementation
 *   }
 * }
 * ```
 *
 * @see {@link embed} - Use with embed() function
 * @see {@link embedMany} - Use with embedMany() function
 */
export interface EmbeddingModel<VALUE = string> {
  /** Unique identifier for this model (e.g., 'transformers:Xenova/all-MiniLM-L6-v2') */
  readonly modelId: string;

  /** Provider name (e.g., 'transformers', 'openai', 'custom') */
  readonly provider: string;

  /** Output embedding dimensions */
  readonly dimensions: number;

  /** Maximum values per doEmbed call (undefined = no limit) */
  readonly maxEmbeddingsPerCall: number | undefined;

  /** Whether parallel doEmbed calls are supported */
  readonly supportsParallelCalls: boolean;

  /**
   * Generate embeddings for the given values.
   *
   * @param options - Embedding options
   * @returns Promise with embeddings, usage, and response info
   */
  doEmbed(options: DoEmbedOptions<VALUE>): Promise<DoEmbedResult>;
}

/**
 * Options passed to EmbeddingModel.doEmbed()
 */
export interface DoEmbedOptions<VALUE = string> {
  /** Values to embed */
  values: VALUE[];

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Custom headers to include in requests */
  headers?: Record<string, string>;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from EmbeddingModel.doEmbed()
 */
export interface DoEmbedResult {
  /** Generated embeddings (one per input value) */
  embeddings: Float32Array[];

  /** Token usage information */
  usage: EmbeddingUsage;

  /** Response metadata */
  response: EmbeddingResponse;
}

/**
 * Token usage information for embedding operations.
 */
export interface EmbeddingUsage {
  /** Total tokens used */
  tokens: number;
}

/**
 * Response metadata for embedding operations.
 */
export interface EmbeddingResponse {
  /** Optional request ID */
  id?: string;

  /** Model ID used */
  modelId: string;

  /** Timestamp of the response */
  timestamp: Date;
}

// ═══════════════════════════════════════════════════════════════
// EMBED FUNCTION OPTIONS & RESULTS
// ═══════════════════════════════════════════════════════════════

/**
 * Options for the embed() function.
 *
 * @example
 * ```ts
 * const { embedding, usage } = await embed({
 *   model: transformers.embedding('Xenova/all-MiniLM-L6-v2'),
 *   value: 'Hello world',
 *   maxRetries: 3,
 * });
 * ```
 */
export interface EmbedOptions {
  /** The embedding model to use (model object or string 'provider:modelId') */
  model: EmbeddingModel | string;

  /** The value to embed */
  value: string;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Custom headers to include in requests */
  headers?: Record<string, string>;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the embed() function.
 */
export interface EmbedResult {
  /** The generated embedding vector */
  embedding: Float32Array;

  /** Token usage information */
  usage: EmbeddingUsage;

  /** Response metadata */
  response: EmbeddingResponse;
}

// ═══════════════════════════════════════════════════════════════
// EMBED MANY FUNCTION OPTIONS & RESULTS
// ═══════════════════════════════════════════════════════════════

/**
 * Options for the embedMany() function.
 *
 * @example
 * ```ts
 * const { embeddings, usage } = await embedMany({
 *   model: transformers.embedding('Xenova/all-MiniLM-L6-v2'),
 *   values: ['Hello', 'World'],
 *   maxParallelCalls: 2,
 * });
 * ```
 */
export interface EmbedManyOptions {
  /** The embedding model to use (model object or string 'provider:modelId') */
  model: EmbeddingModel | string;

  /** The values to embed */
  values: string[];

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts per batch (default: 2) */
  maxRetries?: number;

  /** Maximum parallel embedding calls (default: 1) */
  maxParallelCalls?: number;

  /** Custom headers to include in requests */
  headers?: Record<string, string>;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the embedMany() function.
 */
export interface EmbedManyResult {
  /** The generated embedding vectors (one per input value) */
  embeddings: Float32Array[];

  /** Token usage information (combined for all embeddings) */
  usage: EmbeddingUsage;

  /** Response metadata */
  response: EmbeddingResponse;
}

// ═══════════════════════════════════════════════════════════════
// STREAMING EMBED OPTIONS & RESULTS
// ═══════════════════════════════════════════════════════════════

/**
 * Options for the streamEmbedMany() function.
 *
 * @example
 * ```ts
 * for await (const { embedding, index } of streamEmbedMany({
 *   model: transformers.embedding('model'),
 *   values: largeArray,
 *   batchSize: 32,
 *   onBatch: ({ index, count, total }) => console.log(`${index + count}/${total}`),
 * })) {
 *   await db.add({ id: `doc-${index}`, vector: embedding });
 * }
 * ```
 */
export interface StreamEmbedManyOptions {
  /** The embedding model to use */
  model: EmbeddingModel | string;

  /** The values to embed */
  values: string[];

  /** Batch size for processing (default: 32) */
  batchSize?: number;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts per batch (default: 2) */
  maxRetries?: number;

  /** Custom headers to include in requests */
  headers?: Record<string, string>;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;

  /** Callback after each batch is processed */
  onBatch?: (progress: EmbedProgress) => void;
}

/**
 * Progress information for streaming embed operations.
 */
export interface EmbedProgress {
  /** Starting index of this batch */
  index: number;

  /** Number of items in this batch */
  count: number;

  /** Total number of items */
  total: number;

  /** Token usage for this batch */
  usage: EmbeddingUsage;
}

/**
 * Single embedding result from streaming.
 */
export interface StreamEmbedResult {
  /** The generated embedding vector */
  embedding: Float32Array;

  /** Index of this embedding in the original values array */
  index: number;
}

// ═══════════════════════════════════════════════════════════════
// SEMANTIC SEARCH OPTIONS & RESULTS
// ═══════════════════════════════════════════════════════════════

/**
 * Options for the semanticSearch() function.
 *
 * @example
 * ```ts
 * const { results, usage } = await semanticSearch({
 *   db,
 *   model: transformers.embedding('Xenova/all-MiniLM-L6-v2'),
 *   query: 'How to configure authentication?',
 *   k: 5,
 * });
 * ```
 */
export interface SemanticSearchOptions {
  /** The vector database to search */
  db: SemanticSearchDB;

  /** The embedding model to use */
  model: EmbeddingModel | string;

  /** The search query text */
  query: string;

  /** Number of results to return (default: 10) */
  k?: number;

  /** Metadata filter to apply */
  filter?: Record<string, unknown>;

  /** Minimum similarity threshold */
  threshold?: number;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Custom headers to include in requests */
  headers?: Record<string, string>;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Minimal VectorDB interface for semantic search.
 * Avoids circular dependency with main VectorDB type.
 */
export interface SemanticSearchDB {
  search(
    vector: Float32Array,
    options?: { k?: number; filter?: Record<string, unknown>; threshold?: number }
  ): Promise<SemanticSearchDBResult[]>;
}

/**
 * Result from database search for semantic search.
 */
export interface SemanticSearchDBResult {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/**
 * Result from the semanticSearch() function.
 */
export interface SemanticSearchResult {
  /** Search results with similarity scores */
  results: SemanticSearchResultItem[];

  /** Usage information */
  usage: SemanticSearchUsage;
}

/**
 * A single semantic search result item.
 */
export interface SemanticSearchResultItem {
  /** Document ID */
  id: string;

  /** Similarity score (0-1 for cosine) */
  score: number;

  /** Document text (if available in metadata) */
  text?: string;

  /** Document metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Usage information for semantic search.
 */
export interface SemanticSearchUsage {
  /** Tokens used for embedding the query */
  embeddingTokens: number;

  /** Time spent on embedding the query (milliseconds) */
  embedDurationMs: number;

  /** Time spent on database search (milliseconds) */
  searchDurationMs: number;
}

// ═══════════════════════════════════════════════════════════════
// EMBEDDING MODEL MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

/**
 * Middleware for wrapping embedding models.
 *
 * @example Caching middleware
 * ```ts
 * const cachingMiddleware: EmbeddingModelMiddleware = {
 *   wrapEmbed: async ({ doEmbed, values }) => {
 *     const key = values.join('|||');
 *     const cached = cache.get(key);
 *     if (cached) return cached;
 *     const result = await doEmbed();
 *     cache.set(key, result);
 *     return result;
 *   },
 * };
 * ```
 */
export interface EmbeddingModelMiddleware {
  /**
   * Transform input values before embedding.
   * Called before doEmbed with the original values.
   */
  transformParams?: (params: {
    values: string[];
  }) => Promise<{ values: string[] }> | { values: string[] };

  /**
   * Wrap the embedding call (for caching, logging, retry, etc.).
   * Called with the doEmbed function and original values.
   */
  wrapEmbed?: <T>(options: {
    doEmbed: () => Promise<T>;
    values: string[];
    model: EmbeddingModel;
  }) => Promise<T>;
}

// ═══════════════════════════════════════════════════════════════
// EMBEDDING PROVIDER TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Factory function type for creating embedding models.
 */
export type EmbeddingModelFactory = (
  modelId: string,
  settings?: Record<string, unknown>
) => EmbeddingModel;

/**
 * Provider interface for embedding models.
 *
 * @example
 * ```ts
 * const provider: EmbeddingProvider = {
 *   embedding: (modelId, settings) => new MyEmbeddingModel(modelId, settings),
 * };
 * ```
 */
export interface EmbeddingProvider {
  /** Create an embedding model */
  embedding: EmbeddingModelFactory;
}

// ═══════════════════════════════════════════════════════════════
// MODEL REGISTRY TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Model registry for resolving string model IDs.
 *
 * @example
 * ```ts
 * const registry = createModelRegistry({ transformers });
 * const model = registry.embeddingModel('transformers:Xenova/all-MiniLM-L6-v2');
 * ```
 */
export interface EmbeddingModelRegistry {
  /** Resolve a string model ID to an EmbeddingModel */
  embeddingModel(id: string): EmbeddingModel;

  /** List registered provider names */
  listProviders(): string[];
}

/**
 * Options for creating a model registry.
 */
export interface ModelRegistryOptions {
  /** Separator between provider and model ID (default: ':') */
  separator?: string;
}
