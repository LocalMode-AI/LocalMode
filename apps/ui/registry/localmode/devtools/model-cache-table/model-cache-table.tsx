'use client';

import { Package, Trash2 } from 'lucide-react';

import { cn } from '@/registry/localmode/lib/utils';

/**
 * One cached model's info (mirrors the `ModelCacheInfo` snapshot the
 * LocalMode devtools bridge reports — hook output passes straight in).
 */
export interface ModelCacheEntryLike {
  /** Model identifier. */
  modelId: string;
  /** Current status. */
  status: 'loaded' | 'loading' | 'error';
  /** Load duration in milliseconds. */
  loadDurationMs: number;
  /** Last time the model was used (ISO timestamp). */
  lastUsed: string;
  /** On-disk size in bytes, when known. */
  sizeBytes?: number;
}

/** Props for {@link ModelCacheTable}. */
export interface ModelCacheTableProps {
  /** Cached-model entries, keyed by model ID. */
  entries: Record<string, ModelCacheEntryLike>;
  /** When provided, renders a per-row evict control invoking this callback. */
  onEvict?: (modelId: string) => void;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/** Format a load duration for display (ms below 1s, seconds above). */
function formatDuration(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

/** Human-readable byte size ("34.1 MB", "1.3 GB"). */
function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1).replace(/\.0$/, '')} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1).replace(/\.0$/, '')} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Relative time from an ISO timestamp ("3m ago"); null for unparseable input. */
function formatRelative(iso: string): string | null {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

/** Badge tones per model status. */
const STATUS_STYLES: Record<ModelCacheEntryLike['status'], string> = {
  loaded:
    'border-emerald-500/40 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400',
  loading: 'border-amber-500/40 bg-amber-500/5 text-amber-600 dark:text-amber-400',
  error: 'border-destructive/40 bg-destructive/5 text-destructive',
};

/**
 * Cached-model observability table: one row per model showing the model ID
 * (monospace, truncated with a full-ID tooltip), a status badge
 * (loaded / loading / error), the load duration (ms below one second, seconds
 * above), and a relative last-used time. A size column renders only when at
 * least one entry carries `sizeBytes` (human-formatted), and a per-row evict
 * control renders only when `onEvict` is provided. When no models are
 * present, an empty state explains that model loads are captured
 * automatically once devtools instrumentation is enabled.
 *
 * Works with any backend — pass whatever model-cache entries your app tracks.
 * Recommended data source: `useDevToolsModelCache` from
 * `@localmode/devtools/react` (its `Record<string, ModelCacheInfo>` snapshot
 * passes straight into `entries` with no mapping layer).
 *
 * @example
 * ```tsx
 * <ModelCacheTable entries={useDevToolsModelCache()} />
 * ```
 */
export function ModelCacheTable({
  entries,
  onEvict,
  className,
}: ModelCacheTableProps) {
  const models = Object.values(entries);
  const showSize = models.some((m) => m.sizeBytes != null);

  if (models.length === 0) {
    return (
      <div
        className={cn(
          'flex w-full max-w-2xl flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-8 text-center text-card-foreground',
          className,
        )}
      >
        <Package className="size-5 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium">No models loaded yet</p>
        <p className="text-xs text-muted-foreground">
          Call{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
            enableDevTools()
          </code>{' '}
          before loading models - loads and inference are captured
          automatically from model-load events.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'w-full max-w-2xl overflow-x-auto rounded-xl border border-border bg-card text-card-foreground shadow-sm',
        className,
      )}
    >
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Cached models</caption>
        <thead>
          <tr className="border-b border-border text-left">
            <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Model
            </th>
            <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Status
            </th>
            <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Load
            </th>
            <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Last used
            </th>
            {showSize && (
              <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Size
              </th>
            )}
            {onEvict && (
              <th className="px-2 py-2.5">
                <span className="sr-only">Evict</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {models.map((m) => {
            const relative = formatRelative(m.lastUsed);
            return (
              <tr
                key={m.modelId}
                className="border-b border-border last:border-b-0"
              >
                <td className="max-w-[220px] px-4 py-2.5">
                  <span
                    className="block truncate font-mono text-xs"
                    title={m.modelId}
                  >
                    {m.modelId}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
                      STATUS_STYLES[m.status],
                    )}
                  >
                    {m.status === 'loading' && (
                      <span
                        className="size-1.5 animate-pulse rounded-full bg-current"
                        aria-hidden="true"
                      />
                    )}
                    {m.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                  {m.status === 'loading' ? '-' : formatDuration(m.loadDurationMs)}
                </td>
                <td
                  className="whitespace-nowrap px-4 py-2.5 text-muted-foreground"
                  title={relative ? new Date(m.lastUsed).toLocaleString() : undefined}
                >
                  {relative ?? '-'}
                </td>
                {showSize && (
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted-foreground">
                    {m.sizeBytes != null ? formatBytes(m.sizeBytes) : '-'}
                  </td>
                )}
                {onEvict && (
                  <td className="px-2 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => onEvict(m.modelId)}
                      aria-label={`Evict ${m.modelId}`}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
