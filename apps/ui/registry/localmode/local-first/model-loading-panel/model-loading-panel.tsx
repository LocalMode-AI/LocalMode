'use client';

import { Cpu, Info } from 'lucide-react';

import { cn } from '@/registry/localmode/lib/utils';
import {
  DownloadProgress,
  formatContext,
  type DownloadProgressValue,
} from '@/registry/localmode/local-first/model-downloader/model-downloader';

/** Props for {@link ModelLoadingPanel}. */
export interface ModelLoadingPanelProps {
  /** Model display name. */
  name: string;
  /** Human-readable size. */
  size?: string;
  /** Context window in tokens. */
  contextLength?: number;
  /** Category / family label. */
  category?: string;
  /** Progress value (0–1 fraction or {@link DownloadProgressValue}). */
  progress: number | DownloadProgressValue;
  /** Whether the model is loading from cache rather than downloading fresh. */
  cached?: boolean;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * A full-height "waiting for model" splash — the richer, blocking sibling of
 * `ModelDownloader`. Combines model metadata (size, context length, category,
 * a cached-vs-downloading badge) with a progress bar and a two-path help
 * message: a first-download note ("This is a one-time download — it'll be
 * instant next time") vs a cache-load note. Composes `DownloadProgress` and
 * binds to `useModelLoad` (`progressValue`, `cached`, `status`).
 *
 * @example
 * ```tsx
 * <ModelLoadingPanel name="Llama 3.2 1B" size="1.2 GB" progress={progressValue} />
 * ```
 */
export function ModelLoadingPanel({
  name,
  size,
  contextLength,
  category,
  progress,
  cached,
  className,
}: ModelLoadingPanelProps) {
  const isCached =
    cached ?? (typeof progress === 'object' ? Boolean(progress.cached) : false);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex min-h-64 w-full flex-col items-center justify-center gap-5 rounded-xl border border-border bg-card p-8 text-center text-card-foreground',
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Cpu className="size-6 animate-pulse" aria-hidden="true" />
      </span>

      <div className="flex flex-col items-center gap-1">
        <p className="text-base font-semibold">{name}</p>
        <span
          className={cn(
            'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
            isCached
              ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400'
              : 'border-primary/30 bg-primary/5 text-primary',
          )}
        >
          {isCached ? 'Loading from cache' : 'Downloading'}
        </span>
      </div>

      {(size || contextLength != null || category) && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {size && (
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {size}
            </span>
          )}
          {contextLength != null && (
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {formatContext(contextLength)} ctx
            </span>
          )}
          {category && (
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {category}
            </span>
          )}
        </div>
      )}

      <div className="w-full max-w-xs">
        <DownloadProgress value={progress} />
      </div>

      <p className="flex max-w-sm items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          {isCached
            ? 'Reading the model from your device - no network needed.'
            : 'This is a one-time download. It runs entirely on your device and will load instantly next time.'}
        </span>
      </p>
    </div>
  );
}
