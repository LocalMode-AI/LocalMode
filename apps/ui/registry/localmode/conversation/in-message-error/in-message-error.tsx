'use client';

/**
 * @file in-message-error.tsx
 * @description An accessible per-message error/retry block rendered inline on a
 * failed assistant message (not a global toast). It auto-extracts a readable
 * error message and offers a retry action that re-invokes generation. Surfaces
 * local inference failures (OOM, WebGPU lost, model load error) where they
 * happened. Data source: `useChat` (error state).
 */
import * as React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/registry/localmode/lib/utils';
import { Button } from '@/registry/localmode/ui/button';

/** Extract a readable message from an unknown error value. */
export function extractErrorMessage(error: unknown): string {
  if (error == null) return 'An unknown error occurred.';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'object' && 'message' in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return String(error);
}

/** Classify common local-inference failures into a short hint. */
function classify(message: string): string | null {
  const lower = message.toLowerCase();
  if (lower.includes('out of memory') || lower.includes('oom'))
    return 'The model ran out of memory. Try a smaller model.';
  if (lower.includes('webgpu') && lower.includes('lost'))
    return 'The GPU device was lost. Reloading may recover it.';
  if (lower.includes('failed to fetch') || lower.includes('load'))
    return 'The model failed to load. Check your connection for the first download.';
  return null;
}

/** Props for {@link InMessageError}. */
export interface InMessageErrorProps extends React.ComponentProps<'div'> {
  /** The error to surface (string or Error). */
  error: unknown;
  /** Retry handler — re-invokes the failed generation. */
  onRetry?: () => void;
  /** Retry button label. @default "Retry" */
  retryLabel?: string;
}

/**
 * The inline per-message error block.
 *
 * @example
 * ```tsx
 * {message.error && <InMessageError error={message.error} onRetry={() => regenerate(message.id)} />}
 * ```
 */
export function InMessageError({
  error,
  onRetry,
  retryLabel = 'Retry',
  className,
  ...props
}: InMessageErrorProps) {
  const message = extractErrorMessage(error);
  const hint = classify(message);

  return (
    <div
      role="alert"
      data-slot="in-message-error"
      className={cn(
        'space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive',
        className,
      )}
      {...props}
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="font-medium">{message}</p>
            {hint && <p className="mt-0.5 text-xs opacity-90">{hint}</p>}
          </div>
          {onRetry && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRetry}
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              <RefreshCw className="size-4" />
              {retryLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
