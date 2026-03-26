/**
 * @file types.ts
 * @description Type definitions for the image captioner application
 */

/** A captioned image */
export interface CaptionedImage {
  /** Unique identifier */
  id: string;
  /** Image data URL */
  dataUrl: string;
  /** Generated caption */
  caption: string;
  /** File name */
  fileName: string;
}

/** Application error for UI display */
export interface AppError {
  message: string;
  code?: string;
  recoverable?: boolean;
}
