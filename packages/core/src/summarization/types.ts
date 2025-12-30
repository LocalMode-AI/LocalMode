/**
 * Summarization Domain Types
 *
 * Types and interfaces for text summarization.
 *
 * @packageDocumentation
 */

// ═══════════════════════════════════════════════════════════════
// COMMON TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Usage information for summarization.
 */
export interface SummarizationUsage {
  /** Number of input tokens processed */
  inputTokens: number;

  /** Number of output tokens generated */
  outputTokens: number;

  /** Time spent on summarization (milliseconds) */
  durationMs: number;
}

/**
 * Response metadata for summarization.
 */
export interface SummarizationResponse {
  /** Optional request ID */
  id?: string;

  /** Model ID used */
  modelId: string;

  /** Timestamp of the response */
  timestamp: Date;
}

// ═══════════════════════════════════════════════════════════════
// SUMMARIZATION MODEL INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Interface for summarization models.
 *
 * Providers implement this interface to enable text summarization.
 */
export interface SummarizationModel {
  /** Unique identifier for this model */
  readonly modelId: string;

  /** Provider name */
  readonly provider: string;

  /** Maximum input length in tokens */
  readonly maxInputLength?: number;

  /**
   * Summarize text.
   *
   * @param options - Summarization options
   * @returns Promise with summarization result
   */
  doSummarize(options: DoSummarizeOptions): Promise<DoSummarizeResult>;
}

/**
 * Options passed to SummarizationModel.doSummarize()
 */
export interface DoSummarizeOptions {
  /** Text(s) to summarize */
  texts: string[];

  /** Maximum length of summary (in tokens or words) */
  maxLength?: number;

  /** Minimum length of summary (in tokens or words) */
  minLength?: number;

  /** Whether to do extractive or abstractive summarization */
  mode?: 'extractive' | 'abstractive';

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from SummarizationModel.doSummarize()
 */
export interface DoSummarizeResult {
  /** Summaries (one per input text) */
  summaries: string[];

  /** Usage information */
  usage: SummarizationUsage;
}

// ═══════════════════════════════════════════════════════════════
// SUMMARIZE FUNCTION OPTIONS & RESULTS
// ═══════════════════════════════════════════════════════════════

/**
 * Options for the summarize() function.
 *
 * @example
 * ```ts
 * const { summary } = await summarize({
 *   model: transformers.summarizer('Xenova/distilbart-cnn-12-6'),
 *   text: longArticle,
 *   maxLength: 100,
 * });
 * ```
 */
export interface SummarizeOptions {
  /** The summarization model to use */
  model: SummarizationModel | string;

  /** Text to summarize */
  text: string;

  /** Maximum length of summary (default: 150) */
  maxLength?: number;

  /** Minimum length of summary (default: 30) */
  minLength?: number;

  /** Summarization mode */
  mode?: 'extractive' | 'abstractive';

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the summarize() function.
 */
export interface SummarizeResult {
  /** Summary text */
  summary: string;

  /** Usage information */
  usage: SummarizationUsage;

  /** Response metadata */
  response: SummarizationResponse;
}

/**
 * Options for the summarizeMany() function.
 */
export interface SummarizeManyOptions {
  /** The summarization model to use */
  model: SummarizationModel | string;

  /** Texts to summarize */
  texts: string[];

  /** Maximum length of each summary */
  maxLength?: number;

  /** Minimum length of each summary */
  minLength?: number;

  /** Summarization mode */
  mode?: 'extractive' | 'abstractive';

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the summarizeMany() function.
 */
export interface SummarizeManyResult {
  /** Summaries */
  summaries: string[];

  /** Usage information */
  usage: SummarizationUsage;

  /** Response metadata */
  response: SummarizationResponse;
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER FACTORY TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Factory function type for creating summarization models.
 */
export type SummarizationModelFactory = (
  modelId: string,
  settings?: Record<string, unknown>
) => SummarizationModel;

