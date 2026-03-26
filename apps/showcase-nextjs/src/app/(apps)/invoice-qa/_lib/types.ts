/**
 * @file types.ts
 * @description Type definitions for the invoice-qa application
 */

/** A question-answer pair from document QA */
export interface QAEntry {
  /** Unique identifier */
  id: string;
  /** The question asked */
  question: string;
  /** The model's answer */
  answer: string;
  /** Confidence score (0-1) */
  score: number;
}

/** Application error for UI display */
export interface AppError {
  /** Error message for display */
  message: string;
  /** Error code for programmatic handling */
  code?: string;
  /** Whether the error is recoverable */
  recoverable?: boolean;
}
