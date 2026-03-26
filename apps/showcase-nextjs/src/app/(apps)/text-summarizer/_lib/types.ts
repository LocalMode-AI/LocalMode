/**
 * @file types.ts
 * @description Type definitions for the text summarizer application
 */

/** Summary length preset */
export type SummaryLength = 'short' | 'medium' | 'long';

/** Summary length configuration */
export interface LengthConfig {
  /** Label for UI */
  label: string;
  /** Max tokens for summary */
  maxLength: number;
  /** Min tokens for summary */
  minLength: number;
}

/** Application error for UI display */
export interface AppError {
  /** Error message for display */
  message: string;
  /** Error code */
  code?: string;
  /** Whether the error is recoverable */
  recoverable?: boolean;
}
