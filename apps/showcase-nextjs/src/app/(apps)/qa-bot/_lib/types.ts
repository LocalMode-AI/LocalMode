/**
 * @file types.ts
 * @description Type definitions for the QA bot application
 */

/** Result from a question-answering model */
export interface QAResult {
  /** The extracted answer text */
  answer: string;
  /** Confidence score between 0 and 1 */
  score: number;
  /** Start character index in context */
  start: number;
  /** End character index in context */
  end: number;
}

/** A single QA exchange entry */
export interface QAEntry {
  /** Unique entry identifier */
  id: string;
  /** The question that was asked */
  question: string;
  /** The model's answer result */
  result: QAResult;
}

/** Application error type */
export interface AppError {
  /** Human-readable error message */
  message: string;
  /** Optional error code */
  code?: string;
  /** Whether the error is recoverable */
  recoverable?: boolean;
}
