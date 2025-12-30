/**
 * Classification Domain Types
 *
 * Classification interfaces for:
 * - Text classification (sentiment, emotion, intent, topic)
 * - Zero-shot classification
 * - Named Entity Recognition (NER)
 * - Reranking
 *
 * @packageDocumentation
 */

// ═══════════════════════════════════════════════════════════════
// CLASSIFICATION MODEL INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Interface for text classification models.
 *
 * Implement this to create custom classification providers.
 * Supports sentiment analysis, emotion detection, intent classification, etc.
 *
 * @example Custom implementation
 * ```ts
 * class MyClassifier implements ClassificationModel {
 *   readonly modelId = 'custom:my-classifier';
 *   readonly provider = 'custom';
 *   readonly labels = ['positive', 'negative', 'neutral'];
 *
 *   async doClassify(options) {
 *     // Your implementation
 *   }
 * }
 * ```
 */
export interface ClassificationModel {
  /** Unique identifier for this model */
  readonly modelId: string;

  /** Provider name (e.g., 'transformers', 'custom') */
  readonly provider: string;

  /** Supported classification labels */
  readonly labels: string[];

  /**
   * Classify the given texts.
   *
   * @param options - Classification options
   * @returns Promise with classification results
   */
  doClassify(options: DoClassifyOptions): Promise<DoClassifyResult>;
}

/**
 * Options passed to ClassificationModel.doClassify()
 */
export interface DoClassifyOptions {
  /** Texts to classify */
  texts: string[];

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Custom headers to include in requests */
  headers?: Record<string, string>;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from ClassificationModel.doClassify()
 */
export interface DoClassifyResult {
  /** Classification results (one per input text) */
  results: ClassificationResultItem[];

  /** Usage information */
  usage: ClassificationUsage;
}

/**
 * A single classification result.
 */
export interface ClassificationResultItem {
  /** The predicted label */
  label: string;

  /** Confidence score (0-1) */
  score: number;

  /** All label scores (optional) */
  allScores?: Record<string, number>;
}

/**
 * Usage information for classification operations.
 */
export interface ClassificationUsage {
  /** Number of input tokens processed */
  inputTokens: number;

  /** Time spent on classification (milliseconds) */
  durationMs: number;
}

// ═══════════════════════════════════════════════════════════════
// ZERO-SHOT CLASSIFICATION MODEL INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Interface for zero-shot classification models.
 *
 * Zero-shot classification can classify text into arbitrary labels
 * without fine-tuning.
 *
 * @example Custom implementation
 * ```ts
 * class MyZeroShotClassifier implements ZeroShotClassificationModel {
 *   readonly modelId = 'custom:zero-shot';
 *   readonly provider = 'custom';
 *
 *   async doClassifyZeroShot(options) {
 *     // Your implementation
 *   }
 * }
 * ```
 */
export interface ZeroShotClassificationModel {
  /** Unique identifier for this model */
  readonly modelId: string;

  /** Provider name */
  readonly provider: string;

  /**
   * Classify texts into candidate labels without fine-tuning.
   *
   * @param options - Zero-shot classification options
   * @returns Promise with classification results
   */
  doClassifyZeroShot(options: DoClassifyZeroShotOptions): Promise<DoClassifyZeroShotResult>;
}

/**
 * Options passed to ZeroShotClassificationModel.doClassifyZeroShot()
 */
export interface DoClassifyZeroShotOptions {
  /** Texts to classify */
  texts: string[];

  /** Candidate labels to classify into */
  candidateLabels: string[];

  /** Allow multiple labels per text */
  multiLabel?: boolean;

  /** Hypothesis template (e.g., "This text is about {}.") */
  hypothesisTemplate?: string;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Custom headers to include in requests */
  headers?: Record<string, string>;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from ZeroShotClassificationModel.doClassifyZeroShot()
 */
export interface DoClassifyZeroShotResult {
  /** Classification results (one per input text) */
  results: ZeroShotClassificationResultItem[];

  /** Usage information */
  usage: ClassificationUsage;
}

/**
 * A single zero-shot classification result.
 */
export interface ZeroShotClassificationResultItem {
  /** Labels sorted by score (highest first) */
  labels: string[];

  /** Corresponding scores for each label */
  scores: number[];
}

// ═══════════════════════════════════════════════════════════════
// CLASSIFY FUNCTION OPTIONS & RESULTS
// ═══════════════════════════════════════════════════════════════

/**
 * Options for the classify() function.
 *
 * @example
 * ```ts
 * const { label, score } = await classify({
 *   model: transformers.classifier('Xenova/distilbert-sst-2'),
 *   text: 'I love this product!',
 * });
 * ```
 */
export interface ClassifyOptions {
  /** The classification model to use */
  model: ClassificationModel | string;

  /** The text to classify */
  text: string;

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
 * Result from the classify() function.
 */
export interface ClassifyResult {
  /** The predicted label */
  label: string;

  /** Confidence score (0-1) */
  score: number;

  /** All label scores (optional) */
  allScores?: Record<string, number>;

  /** Usage information */
  usage: ClassificationUsage;

  /** Response metadata */
  response: ClassificationResponse;
}

/**
 * Response metadata for classification operations.
 */
export interface ClassificationResponse {
  /** Optional request ID */
  id?: string;

  /** Model ID used */
  modelId: string;

  /** Timestamp of the response */
  timestamp: Date;
}

/**
 * Options for the classifyMany() function.
 */
export interface ClassifyManyOptions {
  /** The classification model to use */
  model: ClassificationModel | string;

  /** The texts to classify */
  texts: string[];

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
 * Result from the classifyMany() function.
 */
export interface ClassifyManyResult {
  /** Classification results (one per input text) */
  results: ClassificationResultItem[];

  /** Usage information */
  usage: ClassificationUsage;

  /** Response metadata */
  response: ClassificationResponse;
}

// ═══════════════════════════════════════════════════════════════
// ZERO-SHOT CLASSIFY FUNCTION OPTIONS & RESULTS
// ═══════════════════════════════════════════════════════════════

/**
 * Options for the classifyZeroShot() function.
 *
 * @example
 * ```ts
 * const { labels, scores } = await classifyZeroShot({
 *   model: transformers.zeroShot('Xenova/bart-large-mnli'),
 *   text: 'I just bought a new car',
 *   candidateLabels: ['finance', 'automotive', 'travel'],
 * });
 * ```
 */
export interface ClassifyZeroShotOptions {
  /** The zero-shot classification model to use */
  model: ZeroShotClassificationModel | string;

  /** The text to classify */
  text: string;

  /** Candidate labels to classify into */
  candidateLabels: string[];

  /** Allow multiple labels */
  multiLabel?: boolean;

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
 * Result from the classifyZeroShot() function.
 */
export interface ClassifyZeroShotResult {
  /** Labels sorted by score (highest first) */
  labels: string[];

  /** Corresponding scores for each label */
  scores: number[];

  /** Usage information */
  usage: ClassificationUsage;

  /** Response metadata */
  response: ClassificationResponse;
}

// ═══════════════════════════════════════════════════════════════
// NAMED ENTITY RECOGNITION (NER) MODEL INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Interface for Named Entity Recognition models.
 *
 * NER identifies and classifies named entities in text
 * (people, organizations, locations, etc.).
 *
 * @example Custom implementation
 * ```ts
 * class MyNERModel implements NERModel {
 *   readonly modelId = 'custom:ner';
 *   readonly provider = 'custom';
 *   readonly entityTypes = ['PERSON', 'ORG', 'LOC'];
 *
 *   async doExtract(options) {
 *     // Your implementation
 *   }
 * }
 * ```
 */
export interface NERModel {
  /** Unique identifier for this model */
  readonly modelId: string;

  /** Provider name */
  readonly provider: string;

  /** Supported entity types */
  readonly entityTypes: string[];

  /**
   * Extract named entities from the given texts.
   *
   * @param options - NER options
   * @returns Promise with extraction results
   */
  doExtract(options: DoExtractEntitiesOptions): Promise<DoExtractEntitiesResult>;
}

/**
 * Options passed to NERModel.doExtract()
 */
export interface DoExtractEntitiesOptions {
  /** Texts to extract entities from */
  texts: string[];

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Custom headers to include in requests */
  headers?: Record<string, string>;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from NERModel.doExtract()
 */
export interface DoExtractEntitiesResult {
  /** Extraction results (one per input text) */
  results: NERResultItem[];

  /** Usage information */
  usage: NERUsage;
}

/**
 * A single NER result for one text.
 */
export interface NERResultItem {
  /** Extracted entities */
  entities: Entity[];
}

/**
 * A single extracted entity.
 */
export interface Entity {
  /** The entity text as it appears in the input */
  text: string;

  /** Entity type (e.g., 'PERSON', 'ORG', 'LOC') */
  type: string;

  /** Start character position in the input text */
  start: number;

  /** End character position in the input text */
  end: number;

  /** Confidence score (0-1) */
  score: number;
}

/**
 * Usage information for NER operations.
 */
export interface NERUsage {
  /** Number of input tokens processed */
  inputTokens: number;

  /** Time spent on extraction (milliseconds) */
  durationMs: number;
}

// ═══════════════════════════════════════════════════════════════
// EXTRACT ENTITIES FUNCTION OPTIONS & RESULTS
// ═══════════════════════════════════════════════════════════════

/**
 * Options for the extractEntities() function.
 *
 * @example
 * ```ts
 * const { entities } = await extractEntities({
 *   model: transformers.ner('Xenova/bert-base-NER'),
 *   text: 'John works at Microsoft in Seattle',
 * });
 * // entities: [
 * //   { text: 'John', type: 'PERSON', start: 0, end: 4, score: 0.99 },
 * //   { text: 'Microsoft', type: 'ORG', start: 14, end: 23, score: 0.98 },
 * //   { text: 'Seattle', type: 'LOC', start: 27, end: 34, score: 0.97 }
 * // ]
 * ```
 */
export interface ExtractEntitiesOptions {
  /** The NER model to use */
  model: NERModel | string;

  /** The text to extract entities from */
  text: string;

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
 * Result from the extractEntities() function.
 */
export interface ExtractEntitiesResult {
  /** Extracted entities */
  entities: Entity[];

  /** Usage information */
  usage: NERUsage;

  /** Response metadata */
  response: NERResponse;
}

/**
 * Response metadata for NER operations.
 */
export interface NERResponse {
  /** Optional request ID */
  id?: string;

  /** Model ID used */
  modelId: string;

  /** Timestamp of the response */
  timestamp: Date;
}

/**
 * Options for the extractEntitiesMany() function.
 */
export interface ExtractEntitiesManyOptions {
  /** The NER model to use */
  model: NERModel | string;

  /** The texts to extract entities from */
  texts: string[];

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
 * Result from the extractEntitiesMany() function.
 */
export interface ExtractEntitiesManyResult {
  /** Extraction results (one per input text) */
  results: NERResultItem[];

  /** Usage information */
  usage: NERUsage;

  /** Response metadata */
  response: NERResponse;
}

// ═══════════════════════════════════════════════════════════════
// RERANKER MODEL INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Interface for reranking models.
 *
 * Rerankers score and reorder documents based on relevance to a query.
 * Used to improve RAG quality after initial retrieval.
 *
 * @example Custom implementation
 * ```ts
 * class MyReranker implements RerankerModel {
 *   readonly modelId = 'custom:reranker';
 *   readonly provider = 'custom';
 *
 *   async doRerank(options) {
 *     // Your implementation
 *   }
 * }
 * ```
 */
export interface RerankerModel {
  /** Unique identifier for this model */
  readonly modelId: string;

  /** Provider name */
  readonly provider: string;

  /**
   * Rerank documents based on relevance to a query.
   *
   * @param options - Reranking options
   * @returns Promise with reranked results
   */
  doRerank(options: DoRerankOptions): Promise<DoRerankResult>;
}

/**
 * Options passed to RerankerModel.doRerank()
 */
export interface DoRerankOptions {
  /** The query to rank against */
  query: string;

  /** Documents to rerank */
  documents: string[];

  /** Number of top results to return */
  topK?: number;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Custom headers to include in requests */
  headers?: Record<string, string>;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from RerankerModel.doRerank()
 */
export interface DoRerankResult {
  /** Reranked results sorted by score (highest first) */
  results: RankedDocument[];

  /** Usage information */
  usage: RerankUsage;
}

/**
 * A single reranked document.
 */
export interface RankedDocument {
  /** Original index in the input documents array */
  index: number;

  /** Relevance score (higher is more relevant) */
  score: number;

  /** The document text */
  text: string;
}

/**
 * Usage information for reranking operations.
 */
export interface RerankUsage {
  /** Number of input tokens processed */
  inputTokens: number;

  /** Time spent on reranking (milliseconds) */
  durationMs: number;
}

// ═══════════════════════════════════════════════════════════════
// RERANK FUNCTION OPTIONS & RESULTS
// ═══════════════════════════════════════════════════════════════

/**
 * Options for the rerank() function.
 *
 * @example
 * ```ts
 * const { results } = await rerank({
 *   model: transformers.reranker('Xenova/ms-marco-MiniLM-L-6-v2'),
 *   query: 'What is machine learning?',
 *   documents: ['ML is a type of AI...', 'Cooking is fun...', 'Deep learning...'],
 *   topK: 2,
 * });
 * // results: [
 * //   { index: 0, score: 0.95, text: 'ML is a type of AI...' },
 * //   { index: 2, score: 0.88, text: 'Deep learning...' }
 * // ]
 * ```
 */
export interface RerankOptions {
  /** The reranker model to use */
  model: RerankerModel | string;

  /** The query to rank against */
  query: string;

  /** Documents to rerank */
  documents: string[];

  /** Number of top results to return (default: all) */
  topK?: number;

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
 * Result from the rerank() function.
 */
export interface RerankResult {
  /** Reranked results sorted by score (highest first) */
  results: RankedDocument[];

  /** Usage information */
  usage: RerankUsage;

  /** Response metadata */
  response: RerankResponse;
}

/**
 * Response metadata for reranking operations.
 */
export interface RerankResponse {
  /** Optional request ID */
  id?: string;

  /** Model ID used */
  modelId: string;

  /** Timestamp of the response */
  timestamp: Date;
}

// ═══════════════════════════════════════════════════════════════
// CLASSIFICATION MODEL MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

/**
 * Middleware for wrapping classification models.
 */
export interface ClassificationModelMiddleware {
  /**
   * Transform input texts before classification.
   */
  transformParams?: (params: {
    texts: string[];
  }) => Promise<{ texts: string[] }> | { texts: string[] };

  /**
   * Wrap the classification call.
   */
  wrapClassify?: <T>(options: {
    doClassify: () => Promise<T>;
    texts: string[];
    model: ClassificationModel;
  }) => Promise<T>;
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Factory function type for creating classification models.
 */
export type ClassificationModelFactory = (
  modelId: string,
  settings?: Record<string, unknown>
) => ClassificationModel;

/**
 * Factory function type for creating zero-shot classification models.
 */
export type ZeroShotClassificationModelFactory = (
  modelId: string,
  settings?: Record<string, unknown>
) => ZeroShotClassificationModel;

/**
 * Factory function type for creating NER models.
 */
export type NERModelFactory = (
  modelId: string,
  settings?: Record<string, unknown>
) => NERModel;

/**
 * Factory function type for creating reranker models.
 */
export type RerankerModelFactory = (
  modelId: string,
  settings?: Record<string, unknown>
) => RerankerModel;

