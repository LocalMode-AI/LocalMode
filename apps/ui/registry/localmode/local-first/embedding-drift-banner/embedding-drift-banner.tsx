'use client';

import { AlertTriangle, RefreshCw, X } from 'lucide-react';

import { cn } from '@/registry/localmode/lib/utils';

/** Reindex progress (mirrors core `ReindexProgress`). */
export interface ReindexProgressLike {
  /** Documents processed so far. */
  completed: number;
  /** Total documents to process. */
  total: number;
  /** Documents skipped (no text to re-embed). */
  skipped?: number;
  /** Current phase. */
  phase: 'embedding' | 'indexing';
}

/** Props for {@link EmbeddingDriftBanner}. */
export interface EmbeddingDriftBannerProps {
  /** Model id used for the vectors already stored. */
  storedModelId: string;
  /** The active embedding model id. */
  currentModelId: string;
  /** Whether a reindex is currently running. */
  isReindexing?: boolean;
  /** Live reindex progress (null when not started). */
  progress?: ReindexProgressLike | null;
  /** Fired when the user starts a re-embed. */
  onReindex?: () => void;
  /** Fired when the user cancels a running reindex. */
  onCancel?: () => void;
  /** Additional class names merged onto the root element. */
  className?: string;
}

const PHASE_LABEL: Record<ReindexProgressLike['phase'], string> = {
  embedding: 'Re-embedding',
  indexing: 'Rebuilding index',
};

/**
 * A warning panel shown when the active embedding model is incompatible with
 * vectors already stored (the model changed or dimensions mismatch). It
 * explains the stored-vs-current model ids, shows a reindex progress bar + phase
 * label while re-embedding, and offers "Re-embed All" / Cancel. Bind to
 * `useReindex` + your compatibility check.
 *
 * @example
 * ```tsx
 * <EmbeddingDriftBanner storedModelId={a} currentModelId={b} onReindex={reindex} />
 * ```
 */
export function EmbeddingDriftBanner({
  storedModelId,
  currentModelId,
  isReindexing = false,
  progress,
  onReindex,
  onCancel,
  className,
}: EmbeddingDriftBannerProps) {
  const percent =
    progress && progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;

  return (
    <div
      role="alert"
      className={cn(
        'flex w-full max-w-lg flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-card-foreground',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-amber-500"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
            Embedding model changed
          </p>
          <p className="text-xs text-muted-foreground">
            Stored vectors were built with{' '}
            <span className="break-all font-mono text-foreground">{storedModelId}</span>,
            but the active model is{' '}
            <span className="break-all font-mono text-foreground">{currentModelId}</span>.
            Re-embed to keep search accurate.
          </p>
        </div>
      </div>

      {isReindexing && progress && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">{PHASE_LABEL[progress.phase]}</span>
            <span className="tabular-nums text-muted-foreground">
              {progress.completed}/{progress.total}
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-amber-500 transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {isReindexing ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
          >
            <X className="size-3.5" aria-hidden="true" />
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={onReindex}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Re-embed All
          </button>
        )}
      </div>
    </div>
  );
}
