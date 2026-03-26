/**
 * @file types.ts
 * @description Type definitions for the object-detector application
 */

/** A detected object with label, score, and bounding box */
export interface Detection {
  /** Object label/class */
  label: string;
  /** Confidence score (0-1) */
  score: number;
  /** Bounding box coordinates */
  box: {
    /** X coordinate of top-left corner */
    x: number;
    /** Y coordinate of top-left corner */
    y: number;
    /** Width of the box */
    width: number;
    /** Height of the box */
    height: number;
  };
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
