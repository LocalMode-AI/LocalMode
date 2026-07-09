'use client';

import { Database, Loader2, Trash2, Zap } from 'lucide-react';

import { cn } from '@/registry/localmode/lib/utils';

/** Cache stats (mirrors core `CacheStats`). */
export interface CacheStatsLike {
  /** Number of cached entries. */
  entries: number;
  /** Hit rate in the 0–1 range. */
  hitRate: number;
}

/** Props for {@link SemanticCacheStatusBar}. */
export interface SemanticCacheStatusBarProps {
  /** Live cache stats (from `useSemanticCache`). */
  stats: CacheStatsLike;
  /** Whether the cache is enabled. */
  enabled: boolean;
  /** Whether the embedding model is still loading (shows a spinner). */
  isLoading?: boolean;
  /** Fired when the enable/disable toggle is flipped. */
  onToggle?: (enabled: boolean) => void;
  /** Fired when the clear-cache button is pressed (shown when entries > 0). */
  onClear?: () => void;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * A compact toolbar row for `useSemanticCache`: entry count, hit-rate %, an
 * icon-only clear-cache button (when entries > 0), and an enable/disable toggle
 * (with a spinner while the embedding model loads). Complements `CacheBadge`,
 * which annotates a single response — this surfaces the cache as a whole. Pair
 * it with a per-message "Cached (38ms)" annotation via {@link CachedAnnotation}.
 *
 * @example
 * ```tsx
 * <SemanticCacheStatusBar stats={stats} enabled={on} onToggle={setOn} onClear={clear} />
 * ```
 */
export function SemanticCacheStatusBar({
  stats,
  enabled,
  isLoading = false,
  onToggle,
  onClear,
  className,
}: SemanticCacheStatusBarProps) {
  const hitPercent = Math.round(stats.hitRate * 100);

  return (
    <div
      className={cn(
        'flex w-full flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-xs text-card-foreground',
        className,
      )}
    >
      <span className="flex items-center gap-1.5 whitespace-nowrap font-medium">
        <Database className="size-3.5 text-muted-foreground" aria-hidden="true" />
        Semantic cache
      </span>

      <span className="whitespace-nowrap text-muted-foreground tabular-nums">
        {stats.entries.toLocaleString()} {stats.entries === 1 ? 'entry' : 'entries'}
      </span>

      <span className="flex items-center gap-1 whitespace-nowrap text-muted-foreground tabular-nums">
        <Zap className="size-3 text-emerald-500" aria-hidden="true" />
        {hitPercent}% hit
      </span>

      <div className="ml-auto flex items-center gap-2">
        {stats.entries > 0 && (
          <button
            type="button"
            aria-label="Clear cache"
            onClick={onClear}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Trash2 className="size-4" />
          </button>
        )}

        {isLoading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Toggle semantic cache"
            onClick={() => onToggle?.(!enabled)}
            className={cn(
              'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              enabled ? 'bg-primary' : 'bg-muted',
            )}
          >
            <span
              className={cn(
                'inline-block size-4 rounded-full bg-white shadow transition-transform',
                enabled ? 'translate-x-4' : 'translate-x-0.5',
              )}
            />
          </button>
        )}
      </div>
    </div>
  );
}

/** Props for {@link CachedAnnotation}. */
export interface CachedAnnotationProps {
  /** Cache-hit latency in milliseconds. */
  latencyMs: number;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * The per-message companion to {@link SemanticCacheStatusBar}: a "Cached (38ms)"
 * annotation rendered next to a response that was served from the semantic
 * cache.
 *
 * @example
 * ```tsx
 * <CachedAnnotation latencyMs={38} />
 * ```
 */
export function CachedAnnotation({ latencyMs, className }: CachedAnnotationProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400',
        className,
      )}
    >
      <Zap className="size-3" aria-hidden="true" />
      Cached ({Math.round(latencyMs)}ms)
    </span>
  );
}
