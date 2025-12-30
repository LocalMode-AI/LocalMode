/**
 * Classification Domain
 *
 * Classification functions and types for:
 * - Text classification (sentiment, emotion, intent, topic)
 * - Zero-shot classification
 * - Named Entity Recognition (NER)
 * - Reranking
 *
 * @packageDocumentation
 */

// ═══════════════════════════════════════════════════════════════
// FUNCTIONS - CLASSIFICATION
// ═══════════════════════════════════════════════════════════════

export {
  classify,
  classifyMany,
  classifyZeroShot,
  setGlobalClassificationProvider,
} from './classify.js';

// ═══════════════════════════════════════════════════════════════
// FUNCTIONS - NAMED ENTITY RECOGNITION (NER)
// ═══════════════════════════════════════════════════════════════

export {
  extractEntities,
  extractEntitiesMany,
  setGlobalNERProvider,
} from './extract-entities.js';

// ═══════════════════════════════════════════════════════════════
// FUNCTIONS - RERANKING
// ═══════════════════════════════════════════════════════════════

export { rerank, setGlobalRerankerProvider } from './rerank.js';

// ═══════════════════════════════════════════════════════════════
// TYPES - CLASSIFICATION
// ═══════════════════════════════════════════════════════════════

export type {
  // Classification model interface
  ClassificationModel,
  DoClassifyOptions,
  DoClassifyResult,
  ClassificationResultItem,
  ClassificationUsage,

  // Zero-shot classification model interface
  ZeroShotClassificationModel,
  DoClassifyZeroShotOptions,
  DoClassifyZeroShotResult,
  ZeroShotClassificationResultItem,

  // classify() function types
  ClassifyOptions,
  ClassifyResult,
  ClassifyManyOptions,
  ClassifyManyResult,
  ClassificationResponse,

  // classifyZeroShot() function types
  ClassifyZeroShotOptions,
  ClassifyZeroShotResult,

  // Middleware types
  ClassificationModelMiddleware,

  // Factory types
  ClassificationModelFactory,
  ZeroShotClassificationModelFactory,
} from './types.js';

// ═══════════════════════════════════════════════════════════════
// TYPES - NAMED ENTITY RECOGNITION (NER)
// ═══════════════════════════════════════════════════════════════

export type {
  // NER model interface
  NERModel,
  DoExtractEntitiesOptions,
  DoExtractEntitiesResult,
  NERResultItem,
  Entity,
  NERUsage,

  // extractEntities() function types
  ExtractEntitiesOptions,
  ExtractEntitiesResult,
  ExtractEntitiesManyOptions,
  ExtractEntitiesManyResult,
  NERResponse,

  // Factory types
  NERModelFactory,
} from './types.js';

// ═══════════════════════════════════════════════════════════════
// TYPES - RERANKING
// ═══════════════════════════════════════════════════════════════

export type {
  // Reranker model interface
  RerankerModel,
  DoRerankOptions,
  DoRerankResult,
  RankedDocument,
  RerankUsage,

  // rerank() function types
  RerankOptions,
  RerankResult,
  RerankResponse,

  // Factory types
  RerankerModelFactory,
} from './types.js';

