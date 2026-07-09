'use client';

import { AlertTriangle, RefreshCw, X } from 'lucide-react';

import { cn } from '@/registry/localmode/lib/utils';

/** Props for {@link ErrorAlert}. */
export interface ErrorAlertProps {
  /** The error message to display. */
  message: string;
  /** Optional retry handler — the Retry button renders only when provided. */
  onRetry?: () => void;
  /** Dismiss the alert. */
  onDismiss: () => void;
  /** Additional class names merged onto the alert. */
  className?: string;
}

/**
 * A compact, dismissible error surface with an optional retry action. Renders a
 * `role="alert"` region with the message, a Retry button (only when `onRetry`
 * is provided), and a dismiss control. Presentational — the consumer owns the
 * operation state and decides what retry and dismiss do.
 *
 * Styled with shadcn/ui CSS variables so it inherits the consumer's theme.
 *
 * @example
 * ```tsx
 * {error && (
 *   <ErrorAlert message={error} onRetry={run} onDismiss={() => setError(null)} />
 * )}
 * ```
 */
export function ErrorAlert({ message, onRetry, onDismiss, className }: ErrorAlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive',
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1 break-words font-medium">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <RefreshCw className="h-3 w-3" aria-hidden /> Retry
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="rounded p-0.5 hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
