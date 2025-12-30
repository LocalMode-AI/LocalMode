/**
 * Question Answering Domain Types
 *
 * Types and interfaces for extractive question answering.
 *
 * @packageDocumentation
 */

// ═══════════════════════════════════════════════════════════════
// COMMON TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Usage information for question answering.
 */
export interface QuestionAnsweringUsage {
  /** Number of input tokens processed */
  inputTokens: number;

  /** Time spent on processing (milliseconds) */
  durationMs: number;
}

/**
 * Response metadata for question answering.
 */
export interface QuestionAnsweringResponse {
  /** Optional request ID */
  id?: string;

  /** Model ID used */
  modelId: string;

  /** Timestamp of the response */
  timestamp: Date;
}

/**
 * An extracted answer from the context.
 */
export interface ExtractedAnswer {
  /** The extracted answer text */
  answer: string;

  /** Confidence score (0-1) */
  score: number;

  /** Start character position in the context */
  start: number;

  /** End character position in the context */
  end: number;
}

// ═══════════════════════════════════════════════════════════════
// QUESTION ANSWERING MODEL INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Interface for extractive question answering models.
 *
 * Providers implement this interface to enable QA from context.
 */
export interface QuestionAnsweringModel {
  /** Unique identifier for this model */
  readonly modelId: string;

  /** Provider name */
  readonly provider: string;

  /** Maximum context length */
  readonly maxContextLength?: number;

  /**
   * Answer questions based on context.
   *
   * @param options - Question answering options
   * @returns Promise with answer result
   */
  doAnswer(options: DoAnswerQuestionOptions): Promise<DoAnswerQuestionResult>;
}

/**
 * Options passed to QuestionAnsweringModel.doAnswer()
 */
export interface DoAnswerQuestionOptions {
  /** Questions to answer */
  questions: Array<{
    question: string;
    context: string;
  }>;

  /** Number of top answers to return per question */
  topK?: number;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from QuestionAnsweringModel.doAnswer()
 */
export interface DoAnswerQuestionResult {
  /** Answers for each question (array of answers per question) */
  results: ExtractedAnswer[][];

  /** Usage information */
  usage: QuestionAnsweringUsage;
}

// ═══════════════════════════════════════════════════════════════
// ANSWER QUESTION FUNCTION OPTIONS & RESULTS
// ═══════════════════════════════════════════════════════════════

/**
 * Options for the answerQuestion() function.
 *
 * @example
 * ```ts
 * const { answer } = await answerQuestion({
 *   model: transformers.questionAnswering('Xenova/distilbert-base-cased-distilled-squad'),
 *   question: 'What is the capital of France?',
 *   context: 'France is a country in Europe. Its capital is Paris.',
 * });
 * ```
 */
export interface AnswerQuestionOptions {
  /** The question answering model to use */
  model: QuestionAnsweringModel | string;

  /** The question to answer */
  question: string;

  /** The context to extract the answer from */
  context: string;

  /** Number of top answers to return (default: 1) */
  topK?: number;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the answerQuestion() function.
 */
export interface AnswerQuestionResult {
  /** The extracted answer */
  answer: string;

  /** Confidence score (0-1) */
  score: number;

  /** Start position in context */
  start: number;

  /** End position in context */
  end: number;

  /** All top answers (if topK > 1) */
  allAnswers?: ExtractedAnswer[];

  /** Usage information */
  usage: QuestionAnsweringUsage;

  /** Response metadata */
  response: QuestionAnsweringResponse;
}

/**
 * Options for the answerQuestionMany() function.
 */
export interface AnswerQuestionManyOptions {
  /** The question answering model to use */
  model: QuestionAnsweringModel | string;

  /** Questions with their contexts */
  questions: Array<{
    question: string;
    context: string;
  }>;

  /** Number of top answers to return per question (default: 1) */
  topK?: number;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the answerQuestionMany() function.
 */
export interface AnswerQuestionManyResult {
  /** Answers for each question */
  answers: ExtractedAnswer[][];

  /** Usage information */
  usage: QuestionAnsweringUsage;

  /** Response metadata */
  response: QuestionAnsweringResponse;
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER FACTORY TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Factory function type for creating question answering models.
 */
export type QuestionAnsweringModelFactory = (
  modelId: string,
  settings?: Record<string, unknown>
) => QuestionAnsweringModel;

