/**
 * @file types.ts
 * @description Type definitions for the OCR scanner application
 */

/** Standard app error shape */
export interface AppError {
  message: string;
  code?: string;
  recoverable?: boolean;
}

/** An available OCR model entry */
export interface OCRModelEntry {
  /** HuggingFace model ID */
  id: string;
  /** Display name */
  name: string;
  /** Approximate download size */
  size: string;
  /** Whether this is a generative (vision-language) OCR model */
  generative: boolean;
  /** Short description */
  description: string;
}

/** OCR mode for generative models */
export interface OCRMode {
  /** Mode identifier */
  id: string;
  /** Display label */
  label: string;
  /** Prompt sent to the model */
  prompt: string;
}
