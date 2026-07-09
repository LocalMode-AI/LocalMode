'use client';

import { cn } from '@/lib/utils';
import { ConfidenceScoreBadge } from '@/registry/localmode/results/confidence-score-badge/confidence-score-badge';

/** A single ranked, scored result. */
export interface ScoredResult {
  /** Human-readable label (class name, detected object, token, …). */
  label: string;
  /** Confidence/relevance score in the inclusive range 0–1. */
  score: number;
}

/** Props for {@link ScoredResultBarList}. */
export interface ScoredResultBarListProps {
  /**
   * The scored results to render. Any ranked-output hook fits this contract:
   * `useClassify` / `useClassifyZeroShot` / `useDetectObjects` / `useFillMask`
   * / `useSemanticSearch`.
   */
  results: ScoredResult[];
  /**
   * When true, render staggered skeleton rows instead of results.
   * @default false
   */
  isLoading?: boolean;
  /**
   * Number of skeleton rows shown while loading.
   * @default 4
   */
  skeletonRows?: number;
  /**
   * Whether to highlight the top-ranked (first) row.
   * @default true
   */
  highlightTop?: boolean;
  /**
   * Whether to sort results by score (descending) before rendering. Set false
   * if the input is already ranked and you want to preserve its order.
   * @default true
   */
  sort?: boolean;
  /**
   * Maximum number of rows to render after sorting.
   */
  limit?: number;
  /**
   * Rendered when there are no results and the list is not loading.
   * @default "No results"
   */
  emptyState?: React.ReactNode;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * A ranked vertical list of `{label, score}` pairs. Each row shows the label, a
 * formatted confidence percentage, and an animated horizontal fill bar
 * proportional to the 0–1 score, highlighting the top-ranked row. Includes a
 * skeleton-loading state and an empty-state slot so it drops straight into async
 * hook flows.
 *
 * One data contract serves every ranked-output hook — classification, zero-shot,
 * object detection, fill-mask, and semantic search.
 *
 * @example
 * ```tsx
 * const { results, isLoading } = useClassifyZeroShot({ model });
 * <ScoredResultBarList results={results ?? []} isLoading={isLoading} />
 * ```
 */
export function ScoredResultBarList({
  results,
  isLoading = false,
  skeletonRows = 4,
  highlightTop = true,
  sort = true,
  limit,
  emptyState = 'No results',
  className,
}: ScoredResultBarListProps) {
  if (isLoading) {
    return (
      <div className={cn('flex flex-col gap-2', className)} aria-busy="true">
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-md bg-muted"
            style={{
              height: 36,
              opacity: 1 - i * (0.6 / Math.max(1, skeletonRows)),
            }}
          />
        ))}
      </div>
    );
  }

  if (!results || results.length === 0) {
    return (
      <div
        className={cn(
          'rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground',
          className,
        )}
      >
        {emptyState}
      </div>
    );
  }

  const ranked = sort
    ? [...results].sort((a, b) => b.score - a.score)
    : results;
  const rows = typeof limit === 'number' ? ranked.slice(0, limit) : ranked;
  const max = Math.max(...rows.map((r) => r.score), 0.0001);

  return (
    <ol className={cn('flex flex-col gap-2', className)}>
      {rows.map((result, i) => {
        const isTop = highlightTop && i === 0;
        const fill = Math.min(1, Math.max(0, result.score / max));
        return (
          <li
            key={`${result.label}-${i}`}
            className={cn(
              'group relative overflow-hidden rounded-md border px-3 py-2 transition-colors',
              isTop
                ? 'border-primary/40 bg-primary/5'
                : 'border-border bg-card',
            )}
          >
            {/* Proportional fill bar (background). */}
            <div
              aria-hidden="true"
              className={cn(
                'absolute inset-y-0 left-0 transition-[width] duration-500 ease-out',
                isTop ? 'bg-primary/15' : 'bg-muted',
              )}
              style={{ width: `${fill * 100}%` }}
            />
            <div className="relative flex items-center justify-between gap-3">
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-sm',
                  isTop ? 'font-semibold text-foreground' : 'text-foreground/90',
                )}
              >
                {result.label}
              </span>
              <ConfidenceScoreBadge score={result.score} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
