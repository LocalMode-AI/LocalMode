/**
 * Translation Domain Types
 *
 * Types and interfaces for text translation.
 *
 * @packageDocumentation
 */

// ═══════════════════════════════════════════════════════════════
// COMMON TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Usage information for translation.
 */
export interface TranslationUsage {
  /** Number of input tokens/characters processed */
  inputTokens: number;

  /** Number of output tokens/characters generated */
  outputTokens: number;

  /** Time spent on translation (milliseconds) */
  durationMs: number;
}

/**
 * Response metadata for translation.
 */
export interface TranslationResponse {
  /** Optional request ID */
  id?: string;

  /** Model ID used */
  modelId: string;

  /** Timestamp of the response */
  timestamp: Date;
}

// ═══════════════════════════════════════════════════════════════
// TRANSLATION MODEL INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Interface for translation models.
 *
 * Providers implement this interface to enable text translation.
 */
export interface TranslationModel {
  /** Unique identifier for this model */
  readonly modelId: string;

  /** Provider name */
  readonly provider: string;

  /** Source language (if model is language-specific) */
  readonly sourceLanguage?: string;

  /** Target language (if model is language-specific) */
  readonly targetLanguage?: string;

  /** Supported language pairs (if model supports multiple) */
  readonly supportedLanguages?: string[];

  /**
   * Translate text.
   *
   * @param options - Translation options
   * @returns Promise with translation result
   */
  doTranslate(options: DoTranslateOptions): Promise<DoTranslateResult>;
}

/**
 * Options passed to TranslationModel.doTranslate()
 */
export interface DoTranslateOptions {
  /** Text(s) to translate */
  texts: string[];

  /** Source language code (ISO 639-1 or 639-3) */
  sourceLanguage?: string;

  /** Target language code (ISO 639-1 or 639-3) */
  targetLanguage?: string;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from TranslationModel.doTranslate()
 */
export interface DoTranslateResult {
  /** Translated texts (one per input) */
  translations: string[];

  /** Detected source language (if auto-detected) */
  detectedLanguage?: string;

  /** Usage information */
  usage: TranslationUsage;
}

// ═══════════════════════════════════════════════════════════════
// TRANSLATE FUNCTION OPTIONS & RESULTS
// ═══════════════════════════════════════════════════════════════

/**
 * Options for the translate() function.
 *
 * @example
 * ```ts
 * const { translation } = await translate({
 *   model: transformers.translator('Xenova/opus-mt-en-de'),
 *   text: 'Hello, how are you?',
 *   targetLanguage: 'de',
 * });
 * ```
 */
export interface TranslateOptions {
  /** The translation model to use */
  model: TranslationModel | string;

  /** Text to translate */
  text: string;

  /** Source language code (optional, may be auto-detected) */
  sourceLanguage?: string;

  /** Target language code */
  targetLanguage?: string;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the translate() function.
 */
export interface TranslateResult {
  /** Translated text */
  translation: string;

  /** Detected source language (if auto-detected) */
  detectedLanguage?: string;

  /** Usage information */
  usage: TranslationUsage;

  /** Response metadata */
  response: TranslationResponse;
}

/**
 * Options for the translateMany() function.
 */
export interface TranslateManyOptions {
  /** The translation model to use */
  model: TranslationModel | string;

  /** Texts to translate */
  texts: string[];

  /** Source language code (optional) */
  sourceLanguage?: string;

  /** Target language code */
  targetLanguage?: string;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the translateMany() function.
 */
export interface TranslateManyResult {
  /** Translated texts */
  translations: string[];

  /** Detected source language (if auto-detected) */
  detectedLanguage?: string;

  /** Usage information */
  usage: TranslationUsage;

  /** Response metadata */
  response: TranslationResponse;
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER FACTORY TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Factory function type for creating translation models.
 */
export type TranslationModelFactory = (
  modelId: string,
  settings?: Record<string, unknown>
) => TranslationModel;

