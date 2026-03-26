/**
 * @file types.ts
 * @description Type definitions for the email classifier application
 */

/** Classification result representing a label and its confidence score */
export interface ClassificationResult {
  /** The classification label */
  label: string;
  /** Confidence score between 0 and 1 */
  score: number;
}

/** Application error with optional recovery information */
export interface AppError {
  /** Human-readable error message */
  message: string;
  /** Machine-readable error code */
  code?: string;
  /** Whether the error can be recovered from */
  recoverable?: boolean;
}
