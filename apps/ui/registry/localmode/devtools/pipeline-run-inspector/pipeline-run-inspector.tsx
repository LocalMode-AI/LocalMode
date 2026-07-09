'use client';

import { ChevronRight, Workflow } from 'lucide-react';

import { cn } from '@/lib/utils';

/** Status of a pipeline run or an individual step. */
export type PipelineRunStatus = 'running' | 'completed' | 'idle' | 'failed';

/**
 * An individual step's timing entry. Optional, forward-compatible: renders as
 * an expandable per-step row when a run carries `steps`.
 */
export interface PipelineStepLike {
  /** Step name. */
  name: string;
  /** Step duration in milliseconds (set once the step finished). */
  durationMs?: number;
  /** Step status. */
  status: PipelineRunStatus;
}

/**
 * A pipeline run snapshot. Mirrors the `@localmode/devtools` `PipelineSnapshot`
 * field names, so `useDevToolsPipelineRuns()` output feeds the `runs` prop
 * directly with no mapping layer.
 */
export interface PipelineRunLike {
  /** Current step name. */
  currentStep: string;
  /** Number of steps completed. */
  completed: number;
  /** Total number of steps. */
  total: number;
  /** Pipeline status. */
  status: PipelineRunStatus;
  /** When the pipeline started (ISO timestamp string). */
  startedAt: string;
  /** Total duration in milliseconds (set on completion). */
  durationMs?: number;
  /** Optional per-step timings; per-step rows render only when present. */
  steps?: PipelineStepLike[];
}

/** Props for {@link PipelineRunInspector}. */
export interface PipelineRunInspectorProps {
  /** Pipeline run snapshots keyed by pipeline name. */
  runs: Record<string, PipelineRunLike>;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/** Badge classes per run status. */
const STATUS_BADGE_STYLES: Record<PipelineRunStatus, string> = {
  running: 'animate-pulse border-primary/40 bg-primary/10 text-primary',
  completed:
    'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  failed: 'border-destructive/40 bg-destructive/10 text-destructive',
  idle: 'border-border bg-muted text-muted-foreground',
};

/** Progress-bar fill classes per run status. */
const PROGRESS_BAR_STYLES: Record<PipelineRunStatus, string> = {
  running: 'bg-primary',
  completed: 'bg-emerald-500',
  failed: 'bg-destructive',
  idle: 'bg-muted-foreground',
};

/** Step-status dot classes for the per-step timing rows. */
const STEP_DOT_STYLES: Record<PipelineRunStatus, string> = {
  running: 'animate-pulse bg-primary',
  completed: 'bg-emerald-500',
  failed: 'bg-destructive',
  idle: 'bg-muted-foreground/40',
};

/** Format a millisecond duration for display (842ms / 1.8s / 2m 5s). */
function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/** One pipeline run card: header, progress bar, step line, optional step rows. */
function PipelineRunCard({ name, run }: { name: string; run: PipelineRunLike }) {
  const percent =
    run.total > 0
      ? Math.min(100, Math.max(0, Math.round((run.completed / run.total) * 100)))
      : 0;
  const steps = run.steps ?? [];

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <span
          className="truncate text-sm font-medium"
          title={`Started ${run.startedAt}`}
        >
          {name}
        </span>
        <span
          className={cn(
            'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize',
            STATUS_BADGE_STYLES[run.status],
          )}
        >
          {run.status}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={run.total}
        aria-valuenow={run.completed}
        aria-label={`${name}: ${run.completed} of ${run.total} steps completed`}
        className="h-1.5 overflow-hidden rounded-full bg-border"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-300',
            PROGRESS_BAR_STYLES[run.status],
          )}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">
          {run.status === 'running' ? (
            <>
              Step:{' '}
              <span className="font-medium text-foreground">{run.currentStep}</span>
            </>
          ) : run.status === 'failed' ? (
            <>
              Failed at{' '}
              <span className="font-medium text-destructive">
                {run.currentStep || 'unknown step'}
              </span>
            </>
          ) : (
            run.currentStep || 'done'
          )}
        </span>
        <span className="shrink-0 tabular-nums">
          {run.completed}/{run.total}
          {run.durationMs != null && ` · ${formatDuration(run.durationMs)}`}
        </span>
      </div>

      {steps.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight
              className="size-3.5 transition-transform group-open:rotate-90"
              aria-hidden="true"
            />
            Step timings ({steps.length})
          </summary>
          <ul className="ml-1.5 mt-1.5 flex flex-col gap-1 border-l border-border pl-3.5">
            {steps.map((step, index) => (
              <li
                key={`${step.name}-${index}`}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={cn(
                      'size-1.5 shrink-0 rounded-full',
                      STEP_DOT_STYLES[step.status],
                    )}
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      'truncate',
                      step.status === 'failed'
                        ? 'text-destructive'
                        : 'text-foreground',
                    )}
                  >
                    {step.name}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {step.durationMs != null
                    ? formatDuration(step.durationMs)
                    : step.status === 'running'
                      ? 'running…'
                      : '-'}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * Per-run pipeline observability cards: run name, status badge (running pulses
 * on the primary color, completed goes emerald, failed goes destructive), a
 * completed/total progress bar, the current step while running, total duration
 * on completion, and optional expandable per-step timing rows when a run
 * carries `steps`. Shows an empty state pointing at
 * `createDevToolsProgressCallback()` when no runs are tracked.
 *
 * Works with any backend — `runs` is a plain record keyed by pipeline name.
 * Recommended data source: `useDevToolsPipelineRuns()` from
 * `@localmode/devtools/react` (on-device, optional); its snapshot record
 * spreads straight into `runs` with no mapping layer.
 *
 * @example
 * ```tsx
 * <PipelineRunInspector
 *   runs={{
 *     'rag-ingest': {
 *       currentStep: 'embed',
 *       completed: 2,
 *       total: 4,
 *       status: 'running',
 *       startedAt: '2026-07-03T09:12:04.000Z',
 *     },
 *   }}
 * />
 * ```
 */
export function PipelineRunInspector({ runs, className }: PipelineRunInspectorProps) {
  const entries = Object.entries(runs);

  return (
    <div
      className={cn(
        'flex w-full max-w-md flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Workflow className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-semibold">Pipeline runs</span>
        {entries.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {entries.length} tracked
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No pipeline runs tracked. Instrument a pipeline with{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
            createDevToolsProgressCallback()
          </code>{' '}
          to see it here.
        </p>
      ) : (
        entries.map(([name, run]) => (
          <PipelineRunCard key={name} name={name} run={run} />
        ))
      )}
    </div>
  );
}
