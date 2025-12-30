/**
 * Error Formatting Utilities
 *
 * Format errors for display to end users.
 *
 * @packageDocumentation
 */

import {
  LocalModeError,
  EmbeddingError,
  ModelNotFoundError,
  ModelLoadError,
  StorageError,
  QuotaExceededError,
  IndexedDBBlockedError,
  ValidationError,
  DimensionMismatchError,
  NetworkError,
  OfflineError,
  FeatureNotSupportedError,
} from './index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Formatted error for UI display.
 */
export interface FormattedError {
  /** User-friendly title */
  title: string;

  /** User-friendly message */
  message: string;

  /** Actionable hint (if available) */
  hint?: string;

  /** Whether the operation can be retried */
  isRetryable: boolean;

  /** Error code for programmatic handling */
  code?: string;

  /** Severity level */
  severity: 'error' | 'warning' | 'info';

  /** Original error (for debugging) */
  originalError?: Error;
}

// ============================================================================
// Error Formatting
// ============================================================================

/**
 * Format an error for display to end users.
 *
 * Returns a structured object suitable for UI display.
 *
 * @param error - Error to format
 * @returns Formatted error object
 *
 * @example
 * ```typescript
 * import { formatErrorForUser } from '@localmode/core';
 *
 * try {
 *   await embed({ model, value: 'text' });
 * } catch (error) {
 *   const formatted = formatErrorForUser(error);
 *
 *   showErrorDialog({
 *     title: formatted.title,
 *     message: formatted.message,
 *     hint: formatted.hint,
 *     showRetryButton: formatted.isRetryable,
 *   });
 * }
 * ```
 */
export function formatErrorForUser(error: unknown): FormattedError {
  // Model not found
  if (error instanceof ModelNotFoundError) {
    return {
      title: 'Model Not Found',
      message: `The embedding model "${error.modelId}" could not be found.`,
      hint: 'Check the model ID and ensure it exists on Hugging Face.',
      isRetryable: false,
      code: error.code,
      severity: 'error',
      originalError: error,
    };
  }

  // Model load error
  if (error instanceof ModelLoadError) {
    return {
      title: 'Model Loading Failed',
      message: `Could not load the model "${error.modelId}".`,
      hint: error.hint ?? 'Check your network connection and try again.',
      isRetryable: true,
      code: error.code,
      severity: 'error',
      originalError: error,
    };
  }

  // Quota exceeded
  if (error instanceof QuotaExceededError) {
    return {
      title: 'Storage Full',
      message: 'Your browser storage is full.',
      hint: 'Clear old data or use a different browser profile.',
      isRetryable: false,
      code: error.code,
      severity: 'error',
      originalError: error,
    };
  }

  // IndexedDB blocked
  if (error instanceof IndexedDBBlockedError) {
    return {
      title: 'Storage Blocked',
      message: 'Cannot access browser storage.',
      hint: 'You may be in private browsing mode. Try using a regular browser window.',
      isRetryable: false,
      code: error.code,
      severity: 'error',
      originalError: error,
    };
  }

  // Dimension mismatch
  if (error instanceof DimensionMismatchError) {
    return {
      title: 'Dimension Mismatch',
      message: `Vector dimension mismatch: expected ${error.expected}, got ${error.received}.`,
      hint: 'Ensure you are using the same embedding model for all operations.',
      isRetryable: false,
      code: 'DIMENSION_MISMATCH',
      severity: 'error',
      originalError: error,
    };
  }

  // Offline error
  if (error instanceof OfflineError) {
    return {
      title: 'Offline',
      message: 'This operation requires an internet connection.',
      hint: 'Check your network connection and try again.',
      isRetryable: true,
      code: error.code,
      severity: 'warning',
      originalError: error,
    };
  }

  // Network error
  if (error instanceof NetworkError) {
    return {
      title: 'Network Error',
      message: error.message,
      hint: error.hint ?? 'Check your network connection and try again.',
      isRetryable: true,
      code: error.code,
      severity: 'error',
      originalError: error,
    };
  }

  // Feature not supported
  if (error instanceof FeatureNotSupportedError) {
    return {
      title: 'Feature Not Supported',
      message: `${error.feature} is not available in this browser.`,
      hint: error.hint,
      isRetryable: false,
      code: error.code,
      severity: 'warning',
      originalError: error,
    };
  }

  // Embedding error
  if (error instanceof EmbeddingError) {
    return {
      title: 'Embedding Error',
      message: error.message,
      hint: error.hint,
      isRetryable: true,
      code: error.code,
      severity: 'error',
      originalError: error,
    };
  }

  // Validation error
  if (error instanceof ValidationError) {
    return {
      title: 'Validation Error',
      message: error.message,
      hint: error.hint,
      isRetryable: false,
      code: error.code,
      severity: 'error',
      originalError: error,
    };
  }

  // Storage error
  if (error instanceof StorageError) {
    return {
      title: 'Storage Error',
      message: error.message,
      hint: error.hint,
      isRetryable: true,
      code: error.code,
      severity: 'error',
      originalError: error,
    };
  }

  // Generic LocalModeError
  if (error instanceof LocalModeError) {
    return {
      title: 'Error',
      message: error.message,
      hint: error.hint,
      isRetryable: true,
      code: error.code,
      severity: 'error',
      originalError: error,
    };
  }

  // Standard Error
  if (error instanceof Error) {
    // Check for common error patterns
    const message = error.message.toLowerCase();

    if (message.includes('network') || message.includes('fetch')) {
      return {
        title: 'Network Error',
        message: 'A network error occurred.',
        hint: 'Check your internet connection and try again.',
        isRetryable: true,
        severity: 'error',
        originalError: error,
      };
    }

    if (message.includes('timeout')) {
      return {
        title: 'Timeout',
        message: 'The operation timed out.',
        hint: 'The server may be slow. Try again later.',
        isRetryable: true,
        severity: 'warning',
        originalError: error,
      };
    }

    if (message.includes('abort') || message.includes('cancel')) {
      return {
        title: 'Cancelled',
        message: 'The operation was cancelled.',
        isRetryable: true,
        severity: 'info',
        originalError: error,
      };
    }

    return {
      title: 'Error',
      message: error.message,
      isRetryable: true,
      severity: 'error',
      originalError: error,
    };
  }

  // Unknown error
  return {
    title: 'Unexpected Error',
    message: 'Something went wrong.',
    hint: 'Please try again. If the problem persists, contact support.',
    isRetryable: true,
    severity: 'error',
  };
}

// ============================================================================
// Error Display Helpers
// ============================================================================

/**
 * Format error for console logging with colors.
 *
 * @param error - Error to format
 * @returns Formatted string with ANSI colors
 */
export function formatErrorForConsole(error: unknown): string {
  const formatted = formatErrorForUser(error);

  const lines: string[] = [];
  const red = '\x1b[31m';
  const yellow = '\x1b[33m';
  const cyan = '\x1b[36m';
  const reset = '\x1b[0m';

  const color = formatted.severity === 'error' ? red : formatted.severity === 'warning' ? yellow : cyan;

  lines.push(`${color}[${formatted.code ?? 'ERROR'}] ${formatted.title}${reset}`);
  lines.push(`  ${formatted.message}`);

  if (formatted.hint) {
    lines.push(`  💡 ${formatted.hint}`);
  }

  if (formatted.originalError?.stack) {
    lines.push('');
    lines.push(`  Stack trace:`);
    lines.push(`  ${formatted.originalError.stack.split('\n').slice(1).join('\n  ')}`);
  }

  return lines.join('\n');
}

/**
 * Format error as HTML for web display.
 *
 * @param error - Error to format
 * @returns HTML string
 */
export function formatErrorAsHTML(error: unknown): string {
  const formatted = formatErrorForUser(error);

  const bgColor =
    formatted.severity === 'error'
      ? '#fee2e2'
      : formatted.severity === 'warning'
        ? '#fef3c7'
        : '#dbeafe';
  const borderColor =
    formatted.severity === 'error'
      ? '#fca5a5'
      : formatted.severity === 'warning'
        ? '#fcd34d'
        : '#93c5fd';
  const textColor =
    formatted.severity === 'error'
      ? '#b91c1c'
      : formatted.severity === 'warning'
        ? '#92400e'
        : '#1e40af';

  let html = `
    <div style="
      background: ${bgColor};
      border: 1px solid ${borderColor};
      border-radius: 8px;
      padding: 16px;
      font-family: system-ui, -apple-system, sans-serif;
    ">
      <h3 style="margin: 0 0 8px; color: ${textColor}; font-size: 16px;">
        ${escapeHTML(formatted.title)}
      </h3>
      <p style="margin: 0 0 8px; color: #374151;">
        ${escapeHTML(formatted.message)}
      </p>
  `;

  if (formatted.hint) {
    html += `
      <p style="margin: 0; color: #6b7280; font-size: 14px;">
        💡 ${escapeHTML(formatted.hint)}
      </p>
    `;
  }

  if (formatted.isRetryable) {
    html += `
      <p style="margin: 8px 0 0; color: #059669; font-size: 14px;">
        ↻ This operation can be retried
      </p>
    `;
  }

  html += '</div>';

  return html;
}

/**
 * Escape HTML special characters.
 */
function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================================
// Error Logging
// ============================================================================

/**
 * Log an error with appropriate formatting.
 *
 * @param error - Error to log
 * @param context - Additional context
 */
export function logError(error: unknown, context?: Record<string, unknown>): void {
  const formatted = formatErrorForUser(error);

  const logMethod =
    formatted.severity === 'error'
      ? console.error
      : formatted.severity === 'warning'
        ? console.warn
        : console.info;

  logMethod(`[${formatted.code ?? 'ERROR'}] ${formatted.title}`);
  logMethod(`  ${formatted.message}`);

  if (formatted.hint) {
    logMethod(`  💡 ${formatted.hint}`);
  }

  if (context) {
    logMethod('  Context:', context);
  }

  if (formatted.originalError?.stack) {
    logMethod(formatted.originalError.stack);
  }
}

