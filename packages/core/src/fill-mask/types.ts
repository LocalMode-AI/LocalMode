/**
 * Fill-Mask Domain Types
 *
 * Types and interfaces for masked language modeling (fill-in-the-blank).
 *
 * @packageDocumentation
 */

// ═══════════════════════════════════════════════════════════════
// COMMON TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Usage information for fill-mask.
 */
export interface FillMaskUsage {
  /** Number of input tokens processed */
  inputTokens: number;

  /** Time spent on processing (milliseconds) */
  durationMs: number;
}

/**
 * Response metadata for fill-mask.
 */
export interface FillMaskResponse {
  /** Optional request ID */
  id?: string;

  /** Model ID used */
  modelId: string;

  /** Timestamp of the response */
  timestamp: Date;
}

/**
 * A single fill-mask prediction.
 */
export interface FillMaskPrediction {
  /** The predicted token */
  token: string;

  /** Confidence score (0-1) */
  score: number;

  /** The full sequence with the mask filled */
  sequence: string;
}

// ═══════════════════════════════════════════════════════════════
// FILL-MASK MODEL INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Interface for fill-mask models.
 *
 * Providers implement this interface to enable masked language modeling.
 */
export interface FillMaskModel {
  /** Unique identifier for this model */
  readonly modelId: string;

  /** Provider name */
  readonly provider: string;

  /** The mask token used by this model (e.g., "[MASK]" or "<mask>") */
  readonly maskToken: string;

  /**
   * Fill in the masked token(s).
   *
   * @param options - Fill-mask options
   * @returns Promise with fill-mask result
   */
  doFillMask(options: DoFillMaskOptions): Promise<DoFillMaskResult>;
}

/**
 * Options passed to FillMaskModel.doFillMask()
 */
export interface DoFillMaskOptions {
  /** Text(s) with mask token(s) */
  texts: string[];

  /** Number of top predictions to return per mask */
  topK?: number;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from FillMaskModel.doFillMask()
 */
export interface DoFillMaskResult {
  /** Predictions for each input text (array of predictions per text) */
  results: FillMaskPrediction[][];

  /** Usage information */
  usage: FillMaskUsage;
}

// ═══════════════════════════════════════════════════════════════
// FILL-MASK FUNCTION OPTIONS & RESULTS
// ═══════════════════════════════════════════════════════════════

/**
 * Options for the fillMask() function.
 *
 * @example
 * ```ts
 * const { predictions } = await fillMask({
 *   model: transformers.fillMask('Xenova/bert-base-uncased'),
 *   text: 'The capital of France is [MASK].',
 *   topK: 5,
 * });
 * ```
 */
export interface FillMaskOptions {
  /** The fill-mask model to use */
  model: FillMaskModel | string;

  /** Text with mask token */
  text: string;

  /** Number of top predictions to return (default: 5) */
  topK?: number;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the fillMask() function.
 */
export interface FillMaskResult {
  /** Top predictions for the masked token */
  predictions: FillMaskPrediction[];

  /** Usage information */
  usage: FillMaskUsage;

  /** Response metadata */
  response: FillMaskResponse;
}

/**
 * Options for the fillMaskMany() function.
 */
export interface FillMaskManyOptions {
  /** The fill-mask model to use */
  model: FillMaskModel | string;

  /** Texts with mask tokens */
  texts: string[];

  /** Number of top predictions to return per mask (default: 5) */
  topK?: number;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the fillMaskMany() function.
 */
export interface FillMaskManyResult {
  /** Predictions for each input text */
  results: FillMaskPrediction[][];

  /** Usage information */
  usage: FillMaskUsage;

  /** Response metadata */
  response: FillMaskResponse;
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER FACTORY TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Factory function type for creating fill-mask models.
 */
export type FillMaskModelFactory = (
  modelId: string,
  settings?: Record<string, unknown>
) => FillMaskModel;

