'use client';

import { ListOrdered } from 'lucide-react';

import { cn } from '@/registry/localmode/lib/utils';

/**
 * Per-queue statistics (mirrors the `QueueStats` snapshot the LocalMode
 * inference queue reports — hook output spreads straight in).
 */
export interface QueueStatsLike {
  /** Number of tasks waiting to execute. */
  pending: number;
  /** Number of tasks currently executing. */
  active: number;
  /** Total tasks completed successfully. */
  completed: number;
  /** Total tasks that failed. */
  failed: number;
  /** Average latency in milliseconds for completed tasks. */
  avgLatencyMs: number;
}

/** Props for {@link InferenceQueueMonitor}. */
export interface InferenceQueueMonitorProps {
  /** Stats per registered queue, keyed by queue name. */
  queues: Record<string, QueueStatsLike>;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/** Format an average latency for display (ms below 1s, seconds above). */
function formatLatency(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

/**
 * Live per-queue view of inference-queue activity: one card per registered
 * queue showing all five queue metrics — pending, active, completed, failed,
 * and average latency. Non-zero active counts are accented (with a live badge
 * on the queue header), non-zero pending counts are highlighted, and non-zero
 * failed counts render destructive. When no queues are present, an empty
 * state directs users to `registerQueue()`.
 *
 * Works with any backend — pass whatever per-queue stats your app tracks.
 * Recommended data source: `useDevToolsQueueStats` from
 * `@localmode/devtools/react` (its snapshot record spreads straight into
 * `queues` with no mapping layer).
 *
 * @example
 * ```tsx
 * <InferenceQueueMonitor queues={useDevToolsQueueStats()} />
 * ```
 */
export function InferenceQueueMonitor({
  queues,
  className,
}: InferenceQueueMonitorProps) {
  const entries = Object.entries(queues);

  if (entries.length === 0) {
    return (
      <div
        className={cn(
          'flex w-full max-w-md flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-8 text-center text-card-foreground',
          className,
        )}
      >
        <ListOrdered className="size-5 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium">No queues registered</p>
        <p className="text-xs text-muted-foreground">
          Call{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
            registerQueue()
          </code>{' '}
          to start tracking inference queue metrics.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex w-full max-w-md flex-col gap-3', className)}>
      {entries.map(([name, stats]) => (
        <div
          key={name}
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
        >
          <div className="flex items-center gap-2">
            <ListOrdered
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="truncate font-mono text-sm font-medium">{name}</span>
            {stats.active > 0 && (
              <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/5 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <span
                  className="size-1.5 animate-pulse rounded-full bg-current"
                  aria-hidden="true"
                />
                {stats.active} active
              </span>
            )}
          </div>

          <div className="grid grid-cols-5 gap-2">
            <Metric
              label="Pending"
              value={stats.pending.toLocaleString()}
              valueClassName={cn(
                stats.pending > 0 && 'text-amber-600 dark:text-amber-400',
              )}
            />
            <Metric
              label="Active"
              value={stats.active.toLocaleString()}
              valueClassName={cn(
                stats.active > 0 && 'text-emerald-600 dark:text-emerald-400',
              )}
            />
            <Metric label="Done" value={stats.completed.toLocaleString()} />
            <Metric
              label="Failed"
              value={stats.failed.toLocaleString()}
              valueClassName={cn(stats.failed > 0 && 'text-destructive')}
            />
            <Metric label="Latency" value={formatLatency(stats.avgLatencyMs)} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** One labelled metric cell in the per-queue grid. */
function Metric({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 rounded-lg border border-border bg-background py-2">
      <span className={cn('text-sm font-semibold tabular-nums', valueClassName)}>
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
