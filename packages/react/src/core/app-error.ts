/**
 * @file app-error.ts
 * @description AppError type and toAppError utility for converting Error to component-friendly error shape
 */

/** Application error shape expected by UI components */
export interface AppError {
  /** Error message for display */
  message: string;
  /** Error code for programmatic handling */
  code?: string;
  /** Whether the error is recoverable (default: true) */
  recoverable?: boolean;
}

/**
 * Convert an Error to the AppError shape expected by components.
 *
 * @param error - The error to convert (null passes through as null)
 * @param recoverable - Whether the error is recoverable (default: true)
 * @returns AppError or null
 *
 * @example
 * ```ts
 * const { error } = useClassify({ model });
 * return { error: toAppError(error) };
 * ```
 */
export function toAppError(error: Error | null, recoverable = true): AppError | null {
  if (!error) return null;
  return { message: error.message, recoverable };
}
