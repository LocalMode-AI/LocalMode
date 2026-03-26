/**
 * @file validate-file.ts
 * @description File validation utility returning AppError or null
 */

import type { AppError } from '../core/app-error.js';

/** Options for file validation */
export interface ValidateFileOptions {
  /** The file to validate */
  file: File;
  /** Accepted MIME types (e.g., ['image/png', 'image/jpeg']) */
  accept?: string[];
  /** Maximum file size in bytes */
  maxSize?: number;
}

/**
 * Validate a file against type and size constraints.
 *
 * Returns an `AppError` with `recoverable: true` if validation fails,
 * or `null` if the file is valid.
 *
 * @param options - File and validation constraints
 * @returns AppError if invalid, null if valid
 *
 * @example
 * ```ts
 * import { validateFile } from '@localmode/react';
 *
 * const error = validateFile({
 *   file,
 *   accept: ['image/png', 'image/jpeg', 'image/webp'],
 *   maxSize: 10_000_000, // 10MB
 * });
 * if (error) {
 *   setError(error);
 *   return;
 * }
 * ```
 */
export function validateFile(options: ValidateFileOptions): AppError | null {
  const { file, accept, maxSize } = options;

  if (accept && !accept.includes(file.type)) {
    return {
      message: `Unsupported file type "${file.type}". Accepted types: ${accept.join(', ')}`,
      recoverable: true,
    };
  }

  if (maxSize !== undefined && file.size > maxSize) {
    const maxMB = (maxSize / 1_000_000).toFixed(0);
    return {
      message: `File too large (${(file.size / 1_000_000).toFixed(1)}MB). Maximum size: ${maxMB}MB`,
      recoverable: true,
    };
  }

  return null;
}
