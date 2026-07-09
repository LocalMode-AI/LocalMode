'use client';

/**
 * @file pipeline-tracker.tsx
 * @description Progress surfaces for multi-step local workflows. `MultiStepPipelineTracker`
 * is a horizontal numbered-step indicator (active / completed / pending) with an
 * optional stage+percentage variant for ingest pipelines; it maps directly to
 * `usePipeline`'s `onProgress` (`{ currentStep, completed, total }`). `StepsPlan`
 * is a vertical connector-bar variant with per-step title + expandable detail and
 * an editable plan outline. `InferenceQueueSurface` visualizes pending tasks
 * grouped by priority (interactive / background) over `useInferenceQueue`.
 */
import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/registry/localmode/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/registry/localmode/ui/collapsible';
import { Progress } from '@/registry/localmode/ui/progress';

/** Props for {@link MultiStepPipelineTracker}. */
export interface MultiStepPipelineTrackerProps
  extends React.ComponentProps<'div'> {
  /** Ordered step labels. */
  steps: string[];
  /** Number of completed steps (e.g. `progress.completed`). */
  completed: number;
  /** The currently active step label (e.g. `progress.currentStep`). */
  currentStep?: string;
}

/**
 * Horizontal numbered-step progress indicator.
 *
 * @example
 * ```tsx
 * const { progress } = usePipeline(steps);
 * <MultiStepPipelineTracker
 *   steps={['Chunk', 'Embed', 'Index']}
 *   completed={progress?.completed ?? 0}
 *   currentStep={progress?.currentStep}
 * />
 * ```
 */
export function MultiStepPipelineTracker({
  steps,
  completed,
  currentStep,
  className,
  ...props
}: MultiStepPipelineTrackerProps) {
  return (
    <div
      data-slot="pipeline-tracker"
      className={cn('flex w-full min-w-0 items-center overflow-x-auto pb-1', className)}
      {...props}
    >
      {steps.map((label, i) => {
        const isDone = i < completed;
        const isActive = currentStep ? label === currentStep : i === completed;
        const state = isDone ? 'completed' : isActive ? 'active' : 'pending';
        return (
          <React.Fragment key={label}>
            <div
              data-state={state}
              className="flex min-w-16 shrink-0 flex-col items-center gap-1 text-center"
            >
              <span
                className={cn(
                  'grid size-7 place-items-center rounded-full border text-xs font-medium tabular-nums',
                  state === 'completed' &&
                    'border-primary bg-primary text-primary-foreground',
                  state === 'active' &&
                    'border-primary bg-background text-primary',
                  state === 'pending' &&
                    'border-border bg-background text-muted-foreground',
                )}
              >
                {isDone ? <Check className="size-4" /> : i + 1}
              </span>
              <span
                className={cn(
                  'max-w-20 truncate text-xs',
                  state === 'pending'
                    ? 'text-muted-foreground'
                    : 'text-foreground',
                )}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span
                className={cn(
                  'mx-1 h-px flex-1 self-start',
                  i < completed ? 'bg-primary' : 'bg-border',
                )}
                style={{ marginTop: 14 }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/** Props for {@link StagePipelineTracker}. */
export interface StagePipelineTrackerProps extends React.ComponentProps<'div'> {
  /** Single-stage label. */
  stage: string;
  /** Percentage in [0, 100]. */
  percent: number;
}

/** Single-stage label + 0–100 bar variant for ingest pipelines. */
export function StagePipelineTracker({
  stage,
  percent,
  className,
  ...props
}: StagePipelineTrackerProps) {
  return (
    <div
      data-slot="stage-pipeline-tracker"
      className={cn('w-full space-y-1.5', className)}
      {...props}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="min-w-0 truncate font-medium text-foreground">{stage}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {Math.round(percent)}%
        </span>
      </div>
      <Progress value={percent} />
    </div>
  );
}

/** A plan/step entry for {@link StepsPlan}. */
export interface PlanStep {
  /** Stable id. */
  id: string;
  /** Step title. */
  title: string;
  /** Optional expandable detail. */
  detail?: string;
  /** Step state. @default "pending" */
  status?: 'pending' | 'active' | 'completed';
}

/** Props for {@link StepsPlan}. */
export interface StepsPlanProps extends React.ComponentProps<'div'> {
  /** The plan steps. */
  steps: PlanStep[];
}

/** Vertical connector-bar plan outline with per-step expandable detail. */
export function StepsPlan({ steps, className, ...props }: StepsPlanProps) {
  return (
    <ol
      data-slot="steps-plan"
      className={cn('relative space-y-3 pl-7', className)}
      {...(props as React.ComponentProps<'ol'>)}
    >
      {/* Vertical connector — centered under the node dots (dot center sits at
          9px from the list's left edge for every status). */}
      <span
        aria-hidden="true"
        className="absolute left-[8.5px] top-1 bottom-1 w-px bg-border"
      />
      {steps.map((step) => {
        const status = step.status ?? 'pending';
        return (
          <li key={step.id} className="relative" data-status={status}>
            <span
              className={cn(
                'absolute -left-[26px] top-1 grid size-3.5 place-items-center rounded-full border bg-background',
                status === 'completed' && 'border-primary bg-primary',
                status === 'active' && 'border-primary',
                status === 'pending' && 'border-border',
              )}
            >
              {status === 'completed' && (
                <Check className="size-2.5 text-primary-foreground" />
              )}
            </span>
            {step.detail ? (
              <Collapsible>
                <CollapsibleTrigger className="flex max-w-full items-center gap-1 rounded-sm text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                  <span className="min-w-0 truncate">{step.title}</span>
                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <p className="mt-1 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {step.detail}
                  </p>
                </CollapsibleContent>
              </Collapsible>
            ) : (
              <span className="block min-w-0 truncate text-sm font-medium">{step.title}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** A queued inference task. */
export interface QueuedTask {
  /** Stable id. */
  id: string;
  /** Human label. */
  label: string;
  /** Priority group. */
  priority: 'interactive' | 'background';
}

/** Props for {@link InferenceQueueSurface}. */
export interface InferenceQueueSurfaceProps extends React.ComponentProps<'div'> {
  /** Pending tasks (e.g. from `useInferenceQueue`). */
  tasks: QueuedTask[];
}

/** Collapsible queue view grouped by priority. */
export function InferenceQueueSurface({
  tasks,
  className,
  ...props
}: InferenceQueueSurfaceProps) {
  const groups: Record<QueuedTask['priority'], QueuedTask[]> = {
    interactive: tasks.filter((t) => t.priority === 'interactive'),
    background: tasks.filter((t) => t.priority === 'background'),
  };

  return (
    <div
      data-slot="inference-queue-surface"
      className={cn('space-y-2', className)}
      {...props}
    >
      {(['interactive', 'background'] as const).map((priority) => (
        <Collapsible key={priority} defaultOpen>
          <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            <span className="min-w-0 truncate font-medium capitalize">{priority}</span>
            <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
              {groups[priority].length}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-1 space-y-1 pl-3">
              {groups[priority].map((task) => (
                <li
                  key={task.id}
                  className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">{task.label}</span>
                </li>
              ))}
              {groups[priority].length === 0 && (
                <li className="text-xs text-muted-foreground">No tasks</li>
              )}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
}
