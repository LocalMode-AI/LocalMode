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

export {
  extractFingerprint,
  fingerprintsMatch,
  checkModelCompatibility,
  reindexCollection,
} from './reindex.js';

export { calibrateThreshold } from './calibrate-threshold.js';

export { getDefaultThreshold, MODEL_THRESHOLD_PRESETS } from './threshold-presets.js';

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

  // Model fingerprint & drift detection types
  ModelFingerprint,
  ModelCompatibilityStatus,
  ModelCompatibilityResult,
  ReindexProgress,
  ReindexOptions,
  ReindexResult,

  // Threshold calibration types
  CalibrateThresholdOptions,
  ThresholdCalibration,
  ThresholdDistributionStats,
} from './types.js';

