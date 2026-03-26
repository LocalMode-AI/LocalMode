/**
 * @file types.ts
 * @description Type definitions for the translator application
 */

/** Supported language pair */
export interface LanguagePair {
  /** Source language code */
  source: string;
  /** Target language code */
  target: string;
  /** Source language display name */
  sourceName: string;
  /** Target language display name */
  targetName: string;
  /** HuggingFace model ID */
  modelId: string;
}

/** Application error for UI display */
export interface AppError {
  message: string;
  code?: string;
  recoverable?: boolean;
}
