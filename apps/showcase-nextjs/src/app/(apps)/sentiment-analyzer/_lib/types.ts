/**
 * @file types.ts
 * @description Type definitions for the sentiment analyzer application
 */

/** Sentiment label */
export type SentimentLabel = 'POSITIVE' | 'NEGATIVE';

/** Single sentiment result */
export interface SentimentResult {
  /** Input text that was analyzed */
  text: string;
  /** Sentiment label */
  label: SentimentLabel;
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
