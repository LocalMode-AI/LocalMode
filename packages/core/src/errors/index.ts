/**
 * Error Classes
 *
 * Comprehensive error classes with helpful hints for debugging.
 *
 * @packageDocumentation
 */

// Re-export formatting utilities
export {
  formatErrorForUser,
  formatErrorForConsole,
  formatErrorAsHTML,
  logError,
  type FormattedError,
} from './format.js';

// ============================================================================
// Base Error
// ============================================================================

/**
 * Base error class for all @localmode errors.
 *
 * Provides structured error information with:
 * - Error code for programmatic handling
 * - User-actionable hint for resolution
 * - Additional context for debugging
 * - Original cause error
 */
export class LocalModeError extends Error {
  /** Error code for programmatic handling */
  readonly code: string;

  /** User-actionable hint to resolve the error */
  readonly hint?: string;

  /** Additional context for debugging */
  readonly context?: Record<string, unknown>;

  /** Original error that caused this one */
  readonly cause?: Error;

  constructor(
    message: string,
    code: string,
    options?: {
      hint?: string;
      context?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'LocalModeError';
    this.code = code;
    this.hint = options?.hint;
    this.context = options?.context;
    this.cause = options?.cause;
  }

  /** Format error for console output */
  toString(): string {
    let msg = `[${this.code}] ${this.message}`;
    if (this.hint) {
      msg += `\n\n💡 Hint: ${this.hint}`;
    }
    return msg;
  }

  /** Convert to JSON-serializable object */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      hint: this.hint,
      context: this.context,
      cause: this.cause?.message,
    };
  }
}

// ============================================================================
// Configuration Errors
// ============================================================================

/**
 * Error for invalid configuration.
 */
export class ConfigError extends LocalModeError {
  constructor(message: string, hint?: string) {
    super(message, 'CONFIG_ERROR', { hint });
    this.name = 'ConfigError';
  }
}

// ============================================================================
// Validation Errors
// ============================================================================

/**
 * Error for validation failures.
 */
export class ValidationError extends LocalModeError {
  constructor(message: string, hint?: string) {
    super(message, 'VALIDATION_ERROR', { hint });
    this.name = 'ValidationError';
  }
}

/**
 * Error for vector dimension mismatches.
 */
export class DimensionMismatchError extends ValidationError {
  readonly expected: number;
  readonly received: number;

  constructor(expected: number, received: number) {
    super(
      `Vector dimension mismatch: expected ${expected}, got ${received}`,
      `Ensure all vectors have ${expected} dimensions. Check that you're using the same embedding model.`
    );
    this.name = 'DimensionMismatchError';
    this.expected = expected;
    this.received = received;
  }
}

/**
 * Error for invalid options.
 */
export class InvalidOptionsError extends ValidationError {
  readonly option: string;

  constructor(option: string, received: unknown, expected: string) {
    super(
      `Invalid option '${option}': expected ${expected}, got ${typeof received}`,
      `Check the API documentation for correct option types.`
    );
    this.name = 'InvalidOptionsError';
    this.option = option;
  }
}

// ============================================================================
// Embedding Errors
// ============================================================================

/**
 * Base error for embedding operations.
 */
export class EmbeddingError extends LocalModeError {
  constructor(message: string, options?: { hint?: string; cause?: Error }) {
    super(message, 'EMBEDDING_ERROR', options);
    this.name = 'EmbeddingError';
  }
}

/**
 * Error when a model is not found.
 */
export class ModelNotFoundError extends EmbeddingError {
  readonly modelId: string;

  constructor(modelId: string) {
    super(`Embedding model not found: ${modelId}`, {
      hint: `Check that the model ID is correct. Popular models include:
• Xenova/all-MiniLM-L6-v2 (384 dimensions)
• Xenova/bge-small-en-v1.5 (384 dimensions)
• Xenova/all-mpnet-base-v2 (768 dimensions)

See https://huggingface.co/models?library=transformers.js for available models.`,
    });
    this.name = 'ModelNotFoundError';
    this.modelId = modelId;
  }
}

/**
 * Error when model fails to load.
 */
export class ModelLoadError extends EmbeddingError {
  readonly modelId: string;

  constructor(modelId: string, cause?: Error) {
    super(`Failed to load embedding model: ${modelId}`, {
      hint: `Model loading failed. Try:
1. Check your network connection (first load downloads the model)
2. Ensure sufficient storage space for model cache
3. Try a smaller model: Xenova/all-MiniLM-L6-v2
4. Check browser console for detailed error messages`,
      cause,
    });
    this.name = 'ModelLoadError';
    this.modelId = modelId;
  }
}

/**
 * Error for embedding dimension issues.
 */
export class EmbeddingDimensionError extends EmbeddingError {
  readonly expected: number;
  readonly received: number;

  constructor(expected: number, received: number, modelId?: string) {
    super(`Embedding dimension mismatch: expected ${expected}, got ${received}`, {
      hint: modelId
        ? `Model '${modelId}' produces ${received}-dimensional embeddings, but database expects ${expected}. Either use a different model or create a new database with the correct dimensions.`
        : `Ensure your embedding model outputs ${expected}-dimensional vectors.`,
    });
    this.name = 'EmbeddingDimensionError';
    this.expected = expected;
    this.received = received;
  }
}

// ============================================================================
// Model Errors
// ============================================================================

/**
 * Base error for model operations.
 */
export class ModelError extends LocalModeError {
  readonly modelId?: string;

  constructor(message: string, options?: { modelId?: string; hint?: string; cause?: Error }) {
    super(message, 'MODEL_ERROR', options);
    this.name = 'ModelError';
    this.modelId = options?.modelId;
  }
}

/**
 * Error when model inference fails.
 */
export class InferenceError extends ModelError {
  constructor(message: string, options?: { modelId?: string; hint?: string; cause?: Error }) {
    super(message, { ...options, hint: options?.hint ?? 'Check input data and model compatibility.' });
    this.name = 'InferenceError';
  }
}

// ============================================================================
// Storage Errors
// ============================================================================

/**
 * Base error for storage operations.
 */
export class StorageError extends LocalModeError {
  constructor(message: string, options?: { hint?: string; cause?: Error }) {
    super(message, 'STORAGE_ERROR', options);
    this.name = 'StorageError';
  }
}

/**
 * Error when storage quota is exceeded.
 */
export class QuotaExceededError extends StorageError {
  readonly usedBytes?: number;
  readonly quotaBytes?: number;

  constructor(options?: { usedBytes?: number; quotaBytes?: number }) {
    super('Storage quota exceeded', {
      hint: `Your browser storage is full. Try:
1. Clear old data: await db.cleanup({ maxAge: '30d' })
2. Request persistent storage: await navigator.storage.persist()
3. Export and delete old collections
4. Use smaller models to reduce cache size`,
    });
    this.name = 'QuotaExceededError';
    this.usedBytes = options?.usedBytes;
    this.quotaBytes = options?.quotaBytes;
  }
}

/**
 * Error when IndexedDB access is blocked.
 */
export class IndexedDBBlockedError extends StorageError {
  constructor() {
    super('IndexedDB access is blocked', {
      hint: `IndexedDB may be blocked because:
• You're in Safari/Firefox Private Browsing mode
• IndexedDB is disabled in browser settings
• Another tab has an outdated version open (refresh all tabs)

Solution: Use in-memory storage for private browsing:
  createVectorDB({ storage: new MemoryStorage() })`,
    });
    this.name = 'IndexedDBBlockedError';
  }
}

/**
 * Error when a document is not found.
 */
export class DocumentNotFoundError extends StorageError {
  readonly documentId: string;

  constructor(documentId: string) {
    super(`Document not found: ${documentId}`, {
      hint: 'Check that the document ID is correct and the document exists in the database.',
    });
    this.name = 'DocumentNotFoundError';
    this.documentId = documentId;
  }
}

/**
 * Error for migration failures.
 */
export class MigrationError extends StorageError {
  readonly fromVersion: number;
  readonly toVersion: number;

  constructor(fromVersion: number, toVersion: number, cause?: Error) {
    super(`Migration failed from version ${fromVersion} to ${toVersion}`, {
      hint: 'Database migration failed. You may need to export data and recreate the database.',
      cause,
    });
    this.name = 'MigrationError';
    this.fromVersion = fromVersion;
    this.toVersion = toVersion;
  }
}

// ============================================================================
// Middleware Errors
// ============================================================================

/**
 * Error in middleware execution.
 */
export class MiddlewareError extends LocalModeError {
  readonly middlewareName?: string;

  constructor(message: string, options?: { middlewareName?: string; hint?: string; cause?: Error }) {
    super(message, 'MIDDLEWARE_ERROR', options);
    this.name = 'MiddlewareError';
    this.middlewareName = options?.middlewareName;
  }
}

// ============================================================================
// Loader Errors
// ============================================================================

/**
 * Error in document loading.
 */
export class LoaderError extends LocalModeError {
  readonly source?: string;

  constructor(message: string, options?: { source?: string; hint?: string; cause?: Error }) {
    super(message, 'LOADER_ERROR', options);
    this.name = 'LoaderError';
    this.source = options?.source;
  }
}

// ============================================================================
// Filter Errors
// ============================================================================

/**
 * Error in filter evaluation.
 */
export class FilterError extends LocalModeError {
  readonly operator?: string;

  constructor(message: string, options?: { operator?: string; hint?: string }) {
    super(message, 'FILTER_ERROR', options);
    this.name = 'FilterError';
    this.operator = options?.operator;
  }
}

// ============================================================================
// Sync Errors
// ============================================================================

/**
 * Error in synchronization.
 */
export class SyncError extends LocalModeError {
  constructor(message: string, options?: { hint?: string; cause?: Error }) {
    super(message, 'SYNC_ERROR', options);
    this.name = 'SyncError';
  }
}

/**
 * Error when a lock cannot be acquired.
 */
export class LockError extends SyncError {
  readonly lockName: string;

  constructor(lockName: string) {
    super(`Failed to acquire lock: ${lockName}`, {
      hint: 'Another tab or process may be holding this lock. Try again later.',
    });
    this.name = 'LockError';
    this.lockName = lockName;
  }
}

// ============================================================================
// Audio/Vision Errors
// ============================================================================

/**
 * Error in audio processing.
 */
export class AudioError extends LocalModeError {
  constructor(message: string, options?: { hint?: string; cause?: Error }) {
    super(message, 'AUDIO_ERROR', options);
    this.name = 'AudioError';
  }
}

/**
 * Error in vision/image processing.
 */
export class VisionError extends LocalModeError {
  constructor(message: string, options?: { hint?: string; cause?: Error }) {
    super(message, 'VISION_ERROR', options);
    this.name = 'VisionError';
  }
}

// ============================================================================
// P2 Domain Errors
// ============================================================================

/**
 * Error in text generation.
 */
export class GenerationError extends LocalModeError {
  constructor(message: string, options?: { hint?: string; cause?: Error }) {
    super(message, 'GENERATION_ERROR', options);
    this.name = 'GenerationError';
  }
}

/**
 * Error when context length is exceeded.
 */
export class ContextLengthExceededError extends GenerationError {
  readonly maxLength: number;
  readonly actualLength: number;

  constructor(maxLength: number, actualLength: number) {
    super(`Context length exceeded: ${actualLength} tokens (max: ${maxLength})`, {
      hint: `Your prompt is too long. Try:
1. Shorten your prompt or system prompt
2. Use a model with longer context (e.g., Llama-3.2)
3. Summarize or chunk your input text`,
    });
    this.name = 'ContextLengthExceededError';
    this.maxLength = maxLength;
    this.actualLength = actualLength;
  }
}

/**
 * Error in translation.
 */
export class TranslationError extends LocalModeError {
  constructor(message: string, options?: { hint?: string; cause?: Error }) {
    super(message, 'TRANSLATION_ERROR', options);
    this.name = 'TranslationError';
  }
}

/**
 * Error when a language is not supported.
 */
export class UnsupportedLanguageError extends TranslationError {
  readonly language: string;
  readonly supportedLanguages?: string[];

  constructor(language: string, supportedLanguages?: string[]) {
    const hint = supportedLanguages
      ? `Supported languages: ${supportedLanguages.slice(0, 10).join(', ')}${supportedLanguages.length > 10 ? '...' : ''}`
      : 'Check the model documentation for supported language pairs.';
    super(`Language not supported: ${language}`, { hint });
    this.name = 'UnsupportedLanguageError';
    this.language = language;
    this.supportedLanguages = supportedLanguages;
  }
}

/**
 * Error in summarization.
 */
export class SummarizationError extends LocalModeError {
  constructor(message: string, options?: { hint?: string; cause?: Error }) {
    super(message, 'SUMMARIZATION_ERROR', options);
    this.name = 'SummarizationError';
  }
}

/**
 * Error in fill-mask operations.
 */
export class FillMaskError extends LocalModeError {
  constructor(message: string, options?: { hint?: string; cause?: Error }) {
    super(message, 'FILL_MASK_ERROR', options);
    this.name = 'FillMaskError';
  }
}

/**
 * Error when mask token is missing.
 */
export class MissingMaskTokenError extends FillMaskError {
  readonly expectedToken: string;

  constructor(expectedToken: string) {
    super(`No mask token found in input. Expected: ${expectedToken}`, {
      hint: `Add the mask token to your text where you want predictions. Example: "The capital of France is ${expectedToken}."`,
    });
    this.name = 'MissingMaskTokenError';
    this.expectedToken = expectedToken;
  }
}

/**
 * Error in question answering.
 */
export class QuestionAnsweringError extends LocalModeError {
  constructor(message: string, options?: { hint?: string; cause?: Error }) {
    super(message, 'QUESTION_ANSWERING_ERROR', options);
    this.name = 'QuestionAnsweringError';
  }
}

/**
 * Error in OCR.
 */
export class OCRError extends LocalModeError {
  constructor(message: string, options?: { hint?: string; cause?: Error }) {
    super(message, 'OCR_ERROR', options);
    this.name = 'OCRError';
  }
}

/**
 * Error when image format is unsupported.
 */
export class ImageFormatError extends VisionError {
  readonly format?: string;

  constructor(format?: string) {
    super(`Unsupported image format${format ? `: ${format}` : ''}`, {
      hint: 'Supported formats: JPEG, PNG, WebP, GIF. Ensure the image is not corrupted.',
    });
    this.name = 'ImageFormatError';
    this.format = format;
  }
}

/**
 * Error in document QA.
 */
export class DocumentQAError extends LocalModeError {
  constructor(message: string, options?: { hint?: string; cause?: Error }) {
    super(message, 'DOCUMENT_QA_ERROR', options);
    this.name = 'DocumentQAError';
  }
}

/**
 * Error in table QA.
 */
export class TableQAError extends LocalModeError {
  constructor(message: string, options?: { hint?: string; cause?: Error }) {
    super(message, 'TABLE_QA_ERROR', options);
    this.name = 'TableQAError';
  }
}

/**
 * Error when table format is invalid.
 */
export class InvalidTableFormatError extends TableQAError {
  constructor(reason: string) {
    super(`Invalid table format: ${reason}`, {
      hint: 'Table must have headers and rows arrays. Example: { headers: ["Name", "Age"], rows: [["John", "30"]] }',
    });
    this.name = 'InvalidTableFormatError';
  }
}

/**
 * Error in image segmentation.
 */
export class SegmentationError extends VisionError {
  constructor(message: string, options?: { hint?: string; cause?: Error }) {
    super(message, options);
    this.name = 'SegmentationError';
  }
}

/**
 * Error in object detection.
 */
export class ObjectDetectionError extends VisionError {
  constructor(message: string, options?: { hint?: string; cause?: Error }) {
    super(message, options);
    this.name = 'ObjectDetectionError';
  }
}

/**
 * Error in image upscaling.
 */
export class ImageUpscaleError extends VisionError {
  constructor(message: string, options?: { hint?: string; cause?: Error }) {
    super(message, options);
    this.name = 'ImageUpscaleError';
  }
}

/**
 * Error in text-to-speech synthesis.
 */
export class SpeechSynthesisError extends AudioError {
  constructor(message: string, options?: { hint?: string; cause?: Error }) {
    super(message, options);
    this.name = 'SpeechSynthesisError';
  }
}

// ============================================================================
// Network Errors
// ============================================================================

/**
 * Error in network operations.
 */
export class NetworkError extends LocalModeError {
  readonly url?: string;
  readonly status?: number;

  constructor(message: string, options?: { url?: string; status?: number; hint?: string; cause?: Error }) {
    super(message, 'NETWORK_ERROR', options);
    this.name = 'NetworkError';
    this.url = options?.url;
    this.status = options?.status;
  }
}

/**
 * Error when offline and network is required.
 */
export class OfflineError extends NetworkError {
  constructor(operation: string) {
    super(`Cannot ${operation}: offline`, {
      hint: 'This operation requires network access. Check your connection and try again.',
    });
    this.name = 'OfflineError';
  }
}

// ============================================================================
// Capability Errors
// ============================================================================

/**
 * Error when a required feature is not supported.
 */
export class FeatureNotSupportedError extends LocalModeError {
  readonly feature: string;

  constructor(feature: string, hint?: string) {
    super(`Feature not supported: ${feature}`, 'FEATURE_NOT_SUPPORTED', {
      hint: hint ?? `This browser does not support ${feature}. Try using a modern browser like Chrome or Firefox.`,
    });
    this.name = 'FeatureNotSupportedError';
    this.feature = feature;
  }
}

/**
 * Error when trying to use a feature in wrong environment.
 */
export class EnvironmentError extends LocalModeError {
  constructor(message: string, hint?: string) {
    super(message, 'ENVIRONMENT_ERROR', { hint });
    this.name = 'EnvironmentError';
  }
}

