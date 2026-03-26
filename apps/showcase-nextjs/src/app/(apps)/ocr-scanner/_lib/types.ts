/**
 * @file types.ts
 * @description Type definitions for the OCR scanner application
 */
export interface AppError {
  message: string;
  code?: string;
  recoverable?: boolean;
}
