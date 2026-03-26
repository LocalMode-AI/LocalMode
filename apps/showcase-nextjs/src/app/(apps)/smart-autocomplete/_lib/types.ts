/**
 * @file types.ts
 * @description Type definitions for the smart autocomplete application
 */

/** A single fill-mask prediction */
export interface Prediction {
  /** The predicted token/word */
  token: string;
  /** Confidence score (0-1) */
  score: number;
}

/** Application error for UI display */
export interface AppError {
  message: string;
  code?: string;
  recoverable?: boolean;
}
