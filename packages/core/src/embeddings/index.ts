/**
 * Embeddings Domain
 *
 * Embedding functions and types for vector generation.
 * All interfaces defined here, implementations in provider packages.
 *
 * @packageDocumentation
 */

// ═══════════════════════════════════════════════════════════════
// FUNCTIONS
// ═══════════════════════════════════════════════════════════════

export { embed, embedMany, streamEmbedMany, setGlobalEmbeddingProvider } from './embed.js';

export { semanticSearch, streamSemanticSearch } from './semantic-search.js';

export { wrapEmbeddingModel, composeEmbeddingMiddleware } from './middleware.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type {
  // Core model interface
  EmbeddingModel,
  DoEmbedOptions,
  DoEmbedResult,
  EmbeddingUsage,
  EmbeddingResponse,

  // embed() function types
  EmbedOptions,
  EmbedResult,

  // embedMany() function types
  EmbedManyOptions,
  EmbedManyResult,

  // Streaming types
  StreamEmbedManyOptions,
  StreamEmbedResult,
  EmbedProgress,

  // Semantic search types
  SemanticSearchOptions,
  SemanticSearchResult,
  SemanticSearchResultItem,
  SemanticSearchUsage,
  SemanticSearchDB,
  SemanticSearchDBResult,

  // Middleware types
  EmbeddingModelMiddleware,

  // Provider types
  EmbeddingModelFactory,
  EmbeddingProvider,

  // Registry types
  EmbeddingModelRegistry,
  ModelRegistryOptions,
} from './types.js';

