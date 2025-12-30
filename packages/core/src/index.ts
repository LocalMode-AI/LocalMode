/**
 * @localmode/core
 *
 * Local-first AI utilities. Zero dependencies. Privacy-first.
 * Contains ALL functions, interfaces, and types.
 *
 * @packageDocumentation
 */

// ═══════════════════════════════════════════════════════════════
// VECTOR DATABASE
// ═══════════════════════════════════════════════════════════════

export { createVectorDB } from './db.js';
export { VectorDBWorkerProxy, createVectorDBWithWorker } from './worker/proxy.js';

export type {
  VectorDB,
  VectorDBConfig,
  Document,
  SearchOptions,
  SearchResult,
  FilterQuery,
  AddManyOptions,
  ExportOptions,
  ImportOptions,
  DBStats,
  HNSWOptions,
  Collection,
  StoredDocument,
  StoredVector,
  EncryptionOptions,
  SyncOptions,
} from './types.js';

export { DEFAULT_CONFIG, DEFAULT_COLLECTION } from './types.js';

// ═══════════════════════════════════════════════════════════════
// EMBEDDINGS DOMAIN
// ═══════════════════════════════════════════════════════════════

export {
  // Functions
  embed,
  embedMany,
  streamEmbedMany,
  semanticSearch,
  streamSemanticSearch,
  setGlobalEmbeddingProvider,
  // Middleware
  wrapEmbeddingModel,
  composeEmbeddingMiddleware,
} from './embeddings/index.js';

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
} from './embeddings/index.js';

// ═══════════════════════════════════════════════════════════════
// CLASSIFICATION DOMAIN (Sentiment, Emotion, Intent, Topic)
// ═══════════════════════════════════════════════════════════════

export {
  classify,
  classifyMany,
  classifyZeroShot,
  setGlobalClassificationProvider,
} from './classification/index.js';

export type {
  // Classification model interface
  ClassificationModel,
  DoClassifyOptions,
  DoClassifyResult,
  ClassificationResultItem,
  ClassificationUsage,
  ClassificationResponse,
  // Zero-shot classification
  ZeroShotClassificationModel,
  DoClassifyZeroShotOptions,
  DoClassifyZeroShotResult,
  ZeroShotClassificationResultItem,
  // classify() function types
  ClassifyOptions,
  ClassifyResult,
  ClassifyManyOptions,
  ClassifyManyResult,
  ClassifyZeroShotOptions,
  ClassifyZeroShotResult,
  // Middleware types
  ClassificationModelMiddleware,
  // Factory types
  ClassificationModelFactory,
  ZeroShotClassificationModelFactory,
} from './classification/index.js';

// ═══════════════════════════════════════════════════════════════
// NAMED ENTITY RECOGNITION (NER) DOMAIN
// ═══════════════════════════════════════════════════════════════

export { extractEntities, extractEntitiesMany, setGlobalNERProvider } from './classification/index.js';

export type {
  // NER model interface
  NERModel,
  DoExtractEntitiesOptions,
  DoExtractEntitiesResult,
  NERResultItem,
  Entity, // NER Entity type
  NERUsage,
  NERResponse,
  // extractEntities() function types
  ExtractEntitiesOptions,
  ExtractEntitiesResult,
  ExtractEntitiesManyOptions,
  ExtractEntitiesManyResult,
  // Factory types
  NERModelFactory,
} from './classification/index.js';

// ═══════════════════════════════════════════════════════════════
// RERANKING DOMAIN
// ═══════════════════════════════════════════════════════════════

export { rerank, setGlobalRerankerProvider } from './classification/index.js';

export type {
  // Reranker model interface
  RerankerModel,
  DoRerankOptions,
  DoRerankResult,
  RankedDocument,
  RerankUsage,
  RerankResponse,
  // rerank() function types
  RerankOptions,
  RerankResult,
  // Factory types
  RerankerModelFactory,
} from './classification/index.js';

// ═══════════════════════════════════════════════════════════════
// VISION DOMAIN (Image Classification, Captioning, Detection, Segmentation)
// ═══════════════════════════════════════════════════════════════

export {
  classifyImage,
  classifyImageZeroShot,
  setGlobalImageClassificationProvider,
  captionImage,
  setGlobalImageCaptionProvider,
  segmentImage,
  setGlobalSegmentationProvider,
  detectObjects,
  setGlobalObjectDetectionProvider,
  extractImageFeatures,
  setGlobalImageFeatureProvider,
  imageToImage,
  setGlobalImageToImageProvider,
} from './vision/index.js';

export type {
  // Common types
  ImageInput,
  BoundingBox,
  VisionUsage,
  VisionResponse,
  // Image classification model interface
  ImageClassificationModel,
  DoClassifyImageOptions,
  DoClassifyImageResult,
  ImageClassificationResultItem,
  // Zero-shot image classification
  ZeroShotImageClassificationModel,
  DoClassifyImageZeroShotOptions,
  DoClassifyImageZeroShotResult,
  ZeroShotImageClassificationResultItem,
  // classifyImage() function types
  ClassifyImageOptions,
  ClassifyImageResult,
  ClassifyImageZeroShotOptions,
  ClassifyImageZeroShotResult,
  // Image captioning model interface
  ImageCaptionModel,
  DoCaptionImageOptions,
  DoCaptionImageResult,
  CaptionImageOptions,
  CaptionImageResult,
  // Object detection model interface
  ObjectDetectionModel,
  DoDetectObjectsOptions,
  DoDetectObjectsResult,
  ObjectDetectionResultItem,
  DetectedObject,
  ZeroShotObjectDetectionModel,
  DoDetectObjectsZeroShotOptions,
  DetectObjectsOptions,
  DetectObjectsResult,
  // Segmentation model interface
  SegmentationModel,
  DoSegmentImageOptions,
  DoSegmentImageResult,
  SegmentationResultItem,
  SegmentMask,
  SegmentImageOptions,
  SegmentImageResult,
  // Depth estimation model interface
  DepthEstimationModel,
  DoEstimateDepthOptions,
  DoEstimateDepthResult,
  EstimateDepthOptions,
  EstimateDepthResult,
  // Image feature extraction model interface
  ImageFeatureModel,
  DoExtractImageFeaturesOptions,
  DoExtractImageFeaturesResult,
  ExtractImageFeaturesOptions,
  ExtractImageFeaturesResult,
  // Image-to-image model interface (P2)
  ImageToImageModel,
  DoTransformImageOptions,
  DoTransformImageResult,
  UpscaleImageOptions,
  UpscaleImageResult,
  // Factory types
  ImageClassificationModelFactory,
  ZeroShotImageClassificationModelFactory,
  ImageCaptionModelFactory,
  ObjectDetectionModelFactory,
  SegmentationModelFactory,
  DepthEstimationModelFactory,
  ImageFeatureModelFactory,
  ImageToImageModelFactory,
} from './vision/index.js';

// ═══════════════════════════════════════════════════════════════
// AUDIO DOMAIN (Speech-to-Text, Text-to-Speech, Audio Classification)
// ═══════════════════════════════════════════════════════════════

export {
  transcribe,
  setGlobalSTTProvider,
  synthesizeSpeech,
  setGlobalTTSProvider,
} from './audio/index.js';

export type {
  // Common types
  AudioInput,
  AudioUsage,
  AudioResponse,
  TranscriptionSegment,
  // Speech-to-text model interface
  SpeechToTextModel,
  DoTranscribeOptions,
  DoTranscribeResult,
  TranscribeOptions,
  TranscribeResult,
  // Text-to-speech model interface
  TextToSpeechModel,
  DoSynthesizeOptions,
  DoSynthesizeResult,
  SynthesizeSpeechOptions,
  SynthesizeSpeechResult,
  // Audio classification model interface
  AudioClassificationModel,
  DoClassifyAudioOptions,
  DoClassifyAudioResult,
  AudioClassificationResultItem,
  // Zero-shot audio classification
  ZeroShotAudioClassificationModel,
  DoClassifyAudioZeroShotOptions,
  DoClassifyAudioZeroShotResult,
  ZeroShotAudioClassificationResultItem,
  // classifyAudio() function types
  ClassifyAudioOptions,
  ClassifyAudioResult,
  ClassifyAudioZeroShotOptions,
  ClassifyAudioZeroShotResult,
  // Factory types
  SpeechToTextModelFactory,
  TextToSpeechModelFactory,
  AudioClassificationModelFactory,
  ZeroShotAudioClassificationModelFactory,
} from './audio/index.js';

// ═══════════════════════════════════════════════════════════════
// GENERATION DOMAIN (P2 - LLM Text Generation)
// ═══════════════════════════════════════════════════════════════

export {
  generateText,
  streamText,
  setGlobalLanguageModelProvider,
} from './generation/index.js';

export type {
  // Language model interface
  LanguageModel,
  DoGenerateOptions,
  DoGenerateResult,
  DoStreamOptions,
  StreamChunk,
  GenerationUsage,
  GenerationResponse,
  FinishReason,
  ChatMessage,
  // generateText() function types
  GenerateTextOptions,
  GenerateTextResult,
  // streamText() function types
  StreamTextOptions,
  StreamTextResult,
  // Factory types
  LanguageModelFactory,
} from './generation/index.js';

// ═══════════════════════════════════════════════════════════════
// TRANSLATION DOMAIN (P2)
// ═══════════════════════════════════════════════════════════════

export {
  translate,
  setGlobalTranslationProvider,
} from './translation/index.js';

export type {
  // Translation model interface
  TranslationModel,
  DoTranslateOptions,
  DoTranslateResult,
  TranslationUsage,
  TranslationResponse,
  // translate() function types
  TranslateOptions,
  TranslateResult,
  TranslateManyOptions,
  TranslateManyResult,
  // Factory types
  TranslationModelFactory,
} from './translation/index.js';

// ═══════════════════════════════════════════════════════════════
// SUMMARIZATION DOMAIN (P2)
// ═══════════════════════════════════════════════════════════════

export {
  summarize,
  setGlobalSummarizationProvider,
} from './summarization/index.js';

export type {
  // Summarization model interface
  SummarizationModel,
  DoSummarizeOptions,
  DoSummarizeResult,
  SummarizationUsage,
  SummarizationResponse,
  // summarize() function types
  SummarizeOptions,
  SummarizeResult,
  SummarizeManyOptions,
  SummarizeManyResult,
  // Factory types
  SummarizationModelFactory,
} from './summarization/index.js';

// ═══════════════════════════════════════════════════════════════
// FILL-MASK DOMAIN (P2)
// ═══════════════════════════════════════════════════════════════

export {
  fillMask,
  setGlobalFillMaskProvider,
} from './fill-mask/index.js';

export type {
  // Fill-mask model interface
  FillMaskModel,
  DoFillMaskOptions,
  DoFillMaskResult,
  FillMaskUsage,
  FillMaskResponse,
  FillMaskPrediction,
  // fillMask() function types
  FillMaskOptions,
  FillMaskResult,
  FillMaskManyOptions,
  FillMaskManyResult,
  // Factory types
  FillMaskModelFactory,
} from './fill-mask/index.js';

// ═══════════════════════════════════════════════════════════════
// QUESTION ANSWERING DOMAIN (P2 - Extractive QA)
// ═══════════════════════════════════════════════════════════════

export {
  answerQuestion,
  setGlobalQuestionAnsweringProvider,
} from './question-answering/index.js';

export type {
  // Question answering model interface
  QuestionAnsweringModel,
  DoAnswerQuestionOptions,
  DoAnswerQuestionResult,
  QuestionAnsweringUsage,
  QuestionAnsweringResponse,
  ExtractedAnswer,
  // answerQuestion() function types
  AnswerQuestionOptions,
  AnswerQuestionResult,
  AnswerQuestionManyOptions,
  AnswerQuestionManyResult,
  // Factory types
  QuestionAnsweringModelFactory,
} from './question-answering/index.js';

// ═══════════════════════════════════════════════════════════════
// OCR DOMAIN (P2 - Optical Character Recognition)
// ═══════════════════════════════════════════════════════════════

export {
  extractText,
  setGlobalOCRProvider,
} from './ocr/index.js';

export type {
  // OCR model interface
  OCRModel,
  DoOCROptions,
  DoOCRResult,
  OCRUsage,
  OCRResponse,
  TextRegion,
  // extractText() function types
  ExtractTextOptions,
  ExtractTextResult,
  ExtractTextManyOptions,
  ExtractTextManyResult,
  // Factory types
  OCRModelFactory,
} from './ocr/index.js';

// ═══════════════════════════════════════════════════════════════
// DOCUMENT QA DOMAIN (P2 - Document/Table Question Answering)
// ═══════════════════════════════════════════════════════════════

export {
  askDocument,
  askTable,
  setGlobalDocumentQAProvider,
} from './document/index.js';

export type {
  // Document QA model interface
  DocumentQAModel,
  DoAskDocumentOptions,
  DoAskDocumentResult,
  TableQAModel,
  DoAskTableOptions,
  DoAskTableResult,
  DocumentInput as DocInput,
  TableData,
  DocumentQAUsage,
  DocumentQAResponse,
  // askDocument() function types
  AskDocumentOptions,
  AskDocumentResult,
  // askTable() function types
  AskTableOptions,
  AskTableResult,
  // Factory types
  DocumentQAModelFactory,
  TableQAModelFactory,
} from './document/index.js';

// ═══════════════════════════════════════════════════════════════
// RAG UTILITIES (Chunking, BM25, Hybrid Search, Ingestion)
// ═══════════════════════════════════════════════════════════════

export type {
  // Chunking types
  ChunkStrategy,
  ChunkOptionsBase,
  RecursiveChunkOptions,
  MarkdownChunkOptions,
  CodeLanguage,
  CodeChunkOptions,
  ChunkOptions,
  Chunk,
  ChunkMetadata,
  Chunker,
  // BM25 types
  BM25Options,
  BM25Document,
  BM25IndexState,
  BM25Result,
  BM25Index,
  // Hybrid search types
  VectorSearchResult,
  HybridSearchOptions,
  HybridSearchResult,
  RRFOptions,
  // Ingestion types
  SourceDocument,
  IngestOptions,
  IngestProgress,
  IngestResult,
  // Document loader types
  LoaderSource,
  LoadedDocument,
  LoaderOptions,
  LoaderResult,
  DocumentLoader,
} from './rag/index.js';

export {
  // Default configurations
  DEFAULT_CHUNK_OPTIONS,
  DEFAULT_RECURSIVE_SEPARATORS,
  DEFAULT_BM25_OPTIONS,
  ENGLISH_STOP_WORDS,
  DEFAULT_HYBRID_OPTIONS,
  DEFAULT_INGEST_OPTIONS,
  // Chunking functions
  chunk,
  createChunker,
  estimateChunkCount,
  getChunkStats,
  recursiveChunk,
  createRecursiveChunker,
  markdownChunk,
  createMarkdownChunker,
  codeChunk,
  createCodeChunker,
  // BM25 keyword search
  BM25,
  createBM25,
  createBM25FromDocuments,
  // Hybrid search
  HybridSearch,
  createHybridSearch,
  hybridFuse,
  reciprocalRankFusion,
  // Ingestion
  ingest,
  chunkDocuments,
  ingestChunks,
  createIngestPipeline,
  estimateIngestion,
} from './rag/index.js';

// ═══════════════════════════════════════════════════════════════
// HNSW INDEX & SIMILARITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

export { HNSWIndex } from './hnsw/index.js';
export {
  cosineSimilarity,
  cosineDistance,
  euclideanDistance,
  dotProduct,
  normalize,
} from './hnsw/distance.js';

// ═══════════════════════════════════════════════════════════════
// QUERY & FILTERING
// ═══════════════════════════════════════════════════════════════

export { matchesFilter, applyFilter } from './query/filter.js';

// Storage (for advanced usage)
export { IndexedDBStorage } from './storage/indexeddb.js';
export { MemoryStorage } from './storage/memory.js';
export { createStorage } from './storage/index.js';
export type { Storage } from './storage/index.js';

// WAL and Migrations
export {
  WAL,
  WAL_STORE_NAME,
  withWAL,
  type WALOperationType,
  type WALEntry,
} from './storage/wal.js';
export {
  MigrationManager,
  MIGRATIONS,
  getCurrentVersion,
  type Migration,
} from './storage/migrations.js';

// Cross-tab sync
export {
  LockManager,
  getLockManager,
  createLockManager, // Export alias
  Broadcaster,
  createBroadcaster,
  type LockMode,
  type LockOptions,
  type BroadcastMessageType,
  type BroadcastMessage,
} from './sync/index.js';

// Security / Encryption
export {
  encrypt,
  decrypt,
  decryptString,
  encryptVector,
  decryptVector,
  encryptJSON,
  decryptJSON,
  isCryptoSupported,
  Keystore,
  createKeystore,
  type EncryptedData,
  type KeyMetadata,
} from './security/index.js';

// ═══════════════════════════════════════════════════════════════
// DOCUMENT LOADERS (Production-Essential Extensibility)
// ═══════════════════════════════════════════════════════════════

export {
  // Loader functions
  loadDocument,
  loadDocuments,
  createLoaderRegistry,
  // Loader classes
  TextLoader,
  createTextLoader,
  JSONLoader,
  createJSONLoader,
  CSVLoader,
  createCSVLoader,
  HTMLLoader,
  createHTMLLoader,
} from './loaders/index.js';

export type {
  // Metadata (core types already exported from RAG)
  LoadedDocumentMetadata,
  // Loader-specific options
  TextLoaderOptions,
  JSONLoaderOptions,
  CSVLoaderOptions,
  HTMLLoaderOptions,
  // Factory types
  DocumentLoaderFactory,
} from './loaders/index.js';

// ═══════════════════════════════════════════════════════════════
// MIDDLEWARE (Production-Essential Extensibility)
// ═══════════════════════════════════════════════════════════════

export {
  // VectorDB middleware
  wrapVectorDB,
  composeVectorDBMiddleware,
  // Built-in middleware
  cachingMiddleware,
  createCachingMiddleware,
  loggingMiddleware,
  createLoggingMiddleware,
  validationMiddleware,
  createValidationMiddleware,
} from './middleware/index.js';

export type {
  // Middleware interfaces
  VectorDBMiddleware,
  WrapVectorDBOptions,
  // Middleware options
  CachingMiddlewareOptions,
  LoggingMiddlewareOptions,
  RetryMiddlewareOptions,
  RateLimitMiddlewareOptions,
  ValidationMiddlewareOptions,
  EncryptionMiddlewareOptions,
  PIIRedactionMiddlewareOptions,
} from './middleware/index.js';

// Retry and Rate-Limit Middleware
export {
  retryMiddleware,
  createRetryMiddleware,
  rateLimitMiddleware,
  createRateLimitMiddleware,
} from './middleware/index.js';

// ═══════════════════════════════════════════════════════════════
// SECURITY (PII Redaction, Encryption Middleware)
// ═══════════════════════════════════════════════════════════════

export {
  redactPII,
  piiRedactionMiddleware,
  encryptionMiddleware,
  deriveEncryptionKey,
  deriveKey, // Alias for backward compatibility
} from './security/index.js';

export type { PIIRedactionOptions } from './security/pii.js';

// ═══════════════════════════════════════════════════════════════
// STORAGE QUOTA & LIFECYCLE (Production-Essential)
// ═══════════════════════════════════════════════════════════════

export {
  getStorageQuota,
  checkQuotaWithWarnings,
  requestPersistence,
  isStoragePersisted,
  estimateRemainingCapacity,
  formatBytes,
  startStorageMonitor,
} from './storage/quota.js';

export {
  cleanup,
  estimateCleanupSize,
  CleanupStrategies,
  parseAge,
  formatDuration,
} from './storage/cleanup.js';

export type { StorageQuota, QuotaWarningConfig, StorageMonitorOptions } from './storage/quota.js';

export type {
  CleanupOptions,
  CleanupProgress,
  CleanupResult,
  EstimateCleanupOptions,
  CleanupEstimate,
  CleanupableDB,
} from './storage/cleanup.js';

// ═══════════════════════════════════════════════════════════════
// NETWORK STATUS (Offline-First)
// ═══════════════════════════════════════════════════════════════

export {
  getNetworkStatus,
  onNetworkChange,
  isOffline,
  isOnline,
  waitForOnline,
  isConnectionSuitable,
  getConnectionRecommendation,
} from './utils/network.js';

export type { NetworkStatus, NetworkChangeCallback } from './utils/network.js';

// ═══════════════════════════════════════════════════════════════
// EVENT SYSTEM (Production-Essential)
// ═══════════════════════════════════════════════════════════════

export {
  createEventEmitter,
  EventEmitter,
  globalEventBus,
  eventMiddleware,
} from './events/index.js';

export type {
  VectorDBEvents,
  EmbeddingEvents,
  EventCallback,
  Unsubscribe,
} from './events/index.js';

// ═══════════════════════════════════════════════════════════════
// CAPABILITY DETECTION (Production-Essential)
// ═══════════════════════════════════════════════════════════════

export {
  detectCapabilities,
  checkFeatureSupport,
  checkModelSupport,
  getRecommendedFallbacks,
  getBrowserRecommendations,
} from './capabilities/detect.js';

export {
  isWebGPUSupported,
  isWebNNSupported,
  isWASMSupported,
  isIndexedDBSupported,
  isWebWorkersSupported,
  isSharedArrayBufferSupported,
  isCrossOriginIsolated,
  isOPFSSupported,
  isBroadcastChannelSupported,
  isWebLocksSupported,
} from './capabilities/features.js';

export {
  getDeviceInfo,
  getMemoryInfo,
  getStorageEstimate,
  getHardwareConcurrency,
  detectGPU,
  detectBrowser,
  detectOS,
  detectDeviceType,
} from './capabilities/device.js';

export { createCapabilityReport, formatCapabilityReport } from './capabilities/report.js';

export type {
  DeviceCapabilities,
  DeviceInfo,
  MemoryInfo,
  FeatureSupportResult,
  FallbackRecommendation,
  BrowserRecommendation,
  ModelSupportResult,
  ModelFallback,
  ModelRequirements,
  CapabilityReport,
} from './capabilities/types.js';

// ═══════════════════════════════════════════════════════════════
// NETWORK LOGGING (Production-Essential)
// ═══════════════════════════════════════════════════════════════

export {
  NetworkLogger,
  createNetworkLogger,
  getGlobalLogger,
  getNetworkLogs,
  clearNetworkLogs,
  onNetworkRequest,
  getNetworkStats,
} from './network/logger.js';

export {
  wrapFetchWithLogging,
  createLoggingFetch,
  unwrapFetch,
  isFetchWrapped,
} from './network/fetch-wrapper.js';

export type { LoggingFetchOptions } from './network/fetch-wrapper.js';

export type {
  NetworkLogEntry,
  NetworkLoggerConfig,
  NetworkStats,
  NetworkLogFilter,
  NetworkRequestCallback,
  ProgressCallback,
} from './network/types.js';

// ═══════════════════════════════════════════════════════════════
// ERROR HANDLING (Production-Essential)
// ═══════════════════════════════════════════════════════════════

export {
  // Base error
  LocalModeError,
  // Configuration
  ConfigError,
  // Validation
  ValidationError,
  DimensionMismatchError,
  InvalidOptionsError,
  // Embeddings
  EmbeddingError,
  ModelNotFoundError,
  ModelLoadError,
  EmbeddingDimensionError,
  // Models
  ModelError,
  InferenceError,
  // Storage
  StorageError,
  QuotaExceededError,
  IndexedDBBlockedError,
  DocumentNotFoundError,
  MigrationError,
  // Middleware
  MiddlewareError,
  // Loaders
  LoaderError,
  // Filters
  FilterError,
  // Sync
  SyncError,
  LockError,
  // Audio/Vision
  AudioError,
  VisionError,
  // Network
  NetworkError,
  OfflineError,
  // Capabilities
  FeatureNotSupportedError,
  EnvironmentError,
  // P2 Domain Errors
  GenerationError,
  ContextLengthExceededError,
  TranslationError,
  UnsupportedLanguageError,
  SummarizationError,
  FillMaskError,
  MissingMaskTokenError,
  QuestionAnsweringError,
  OCRError,
  ImageFormatError,
  DocumentQAError,
  TableQAError,
  InvalidTableFormatError,
  SegmentationError,
  ObjectDetectionError,
  ImageUpscaleError,
  SpeechSynthesisError,
  // Error formatting
  formatErrorForUser,
  formatErrorForConsole,
  formatErrorAsHTML,
  logError,
} from './errors/index.js';

export type { FormattedError } from './errors/format.js';

// ═══════════════════════════════════════════════════════════════
// TESTING UTILITIES
// ═══════════════════════════════════════════════════════════════

export {
  // Random utilities
  createSeededRandom,
  createTestVector,
  createTestVectors,
  // Mock models (P0/P1)
  createMockEmbeddingModel,
  createMockClassificationModel,
  createMockNERModel,
  createMockSpeechToTextModel,
  // Mock models (P2)
  createMockImageCaptionModel,
  createMockSegmentationModel,
  createMockObjectDetectionModel,
  createMockImageFeatureModel,
  createMockImageToImageModel,
  createMockTextToSpeechModel,
  createMockLanguageModel,
  createMockTranslationModel,
  createMockSummarizationModel,
  createMockFillMaskModel,
  createMockQuestionAnsweringModel,
  createMockOCRModel,
  createMockDocumentQAModel,
  // Mock storage
  createMockStorage,
  createMockVectorDB,
  // Test helpers
  waitFor,
  createDeferred,
  createSpy,
} from './testing/index.js';

export type {
  // P0/P1 mock model types
  MockEmbeddingModelOptions,
  MockClassificationModelOptions,
  MockClassificationModel,
  MockNERModelOptions,
  MockNERModel,
  MockSpeechToTextModelOptions,
  MockSpeechToTextModel,
  // P2 mock model types
  MockImageCaptionModelOptions,
  MockImageCaptionModel,
  MockSegmentationModelOptions,
  MockSegmentationModel,
  MockObjectDetectionModelOptions,
  MockObjectDetectionModel,
  MockImageFeatureModelOptions,
  MockImageFeatureModel,
  MockImageToImageModelOptions,
  MockImageToImageModel,
  MockTextToSpeechModelOptions,
  MockTextToSpeechModel,
  MockLanguageModelOptions,
  MockLanguageModel,
  MockTranslationModelOptions,
  MockTranslationModel,
  MockSummarizationModelOptions,
  MockSummarizationModel,
  MockFillMaskModelOptions,
  MockFillMaskModel,
  MockQuestionAnsweringModelOptions,
  MockQuestionAnsweringModel,
  MockOCRModelOptions,
  MockOCRModel,
  MockDocumentQAModelOptions,
  MockDocumentQAModel,
  // Mock storage types
  MockVectorDBOptions,
  SimpleMockStorage,
  SimpleMockVectorDB,
} from './testing/index.js';
