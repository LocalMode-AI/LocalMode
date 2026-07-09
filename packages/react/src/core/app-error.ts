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
 * When the source error is a core LocalModeError (has a string `code` and
 * optionally a `hint`), the `code` is carried over to `AppError.code` and the
 * hint is appended to the message as ` — ${hint}`. Detection is duck-typed so
 * no runtime dependency on @localmode/core is needed.
 *
 * @param error - The error to convert (null passes through as null)
 * @param recoverable - Whether the error is recoverable (default: true)
 * @returns AppError or null
 *
 * @example
 * ```ts
 * const { error } = useClassify({ model });
 * return { error: toAppError(error) };
 * // LocalModeError('Model failed', 'MODEL_LOAD_ERROR', { hint: 'Check your network' })
 * // → { message: 'Model failed — Check your network', code: 'MODEL_LOAD_ERROR', recoverable: true }
 * ```
 */
export function toAppError(error: Error | null, recoverable = true): AppError | null {
  if (!error) return null;
  const { code, hint } = error as { code?: unknown; hint?: unknown };
  const errorCode = typeof code === 'string' && code ? code : undefined;
  const errorHint = typeof hint === 'string' && hint ? hint : undefined;
  return {
    message: errorHint ? `${error.message} — ${errorHint}` : error.message,
    ...(errorCode ? { code: errorCode } : {}),
    recoverable,
  };
}
