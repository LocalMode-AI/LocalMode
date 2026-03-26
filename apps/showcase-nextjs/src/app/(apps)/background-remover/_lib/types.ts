/**
 * @file types.ts
 * @description Type definitions for the background-remover application
 */

/** A segmentation mask result */
export interface SegmentResult {
  /** Segment label */
  label: string;
  /** Confidence score (0-1) */
  score: number;
  /** Mask data */
  mask: ImageData | Uint8Array;
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
