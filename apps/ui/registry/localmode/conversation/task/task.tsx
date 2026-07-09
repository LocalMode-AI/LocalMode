'use client';

/**
 * @file task.tsx
 * @description A multi-step agent process as an ordered list of steps. `Task` is
 * the container; `TaskItem` is one step (index, tool, status, args, observation),
 * with the final-answer step visually distinguished. Its data shape aligns with
 * `@localmode/react` `useAgent` steps (`{ index, type, toolName, toolArgs,
 * observation, result, durationMs }`) so agent UIs wire up without adapters.
 */
import * as React from 'react';
import {
  CheckCircle2,
  Circle,
  Flag,
  Loader2,
} from 'lucide-react';
import { cn } from '@/registry/localmode/lib/utils';

/** A step status. */
export type TaskStepStatus = 'pending' | 'running' | 'completed' | 'error';

/** An agent step (mirrors `@localmode/core` `AgentStep`). */
export interface TaskStep {
  /** Zero-based index. */
  index: number;
  /** Step kind. */
  type: 'tool_call' | 'finish';
  /** Tool name (when `type === 'tool_call'`). */
  toolName?: string;
  /** Tool arguments. */
  toolArgs?: Record<string, unknown>;
  /** Stringified observation/result of the tool. */
  observation?: string;
  /** Final answer (when `type === 'finish'`). */
  result?: string;
  /** Per-step status; defaults to completed when omitted. */
  status?: TaskStepStatus;
}

/** Props for {@link Task}. */
export type TaskProps = React.ComponentProps<'ol'>;

/** Ordered list of agent steps. */
export function Task({ className, ...props }: TaskProps) {
  return (
    <ol
      data-slot="task"
      className={cn('space-y-2', className)}
      {...props}
    />
  );
}

function StatusIcon({ status, type }: { status: TaskStepStatus; type: TaskStep['type'] }) {
  if (type === 'finish')
    return <Flag className="size-4 text-emerald-500" />;
  if (status === 'running')
    return <Loader2 className="size-4 animate-spin text-blue-500" />;
  if (status === 'completed')
    return <CheckCircle2 className="size-4 text-emerald-500" />;
  if (status === 'error')
    return <Circle className="size-4 fill-destructive text-destructive" />;
  return <Circle className="size-4 text-muted-foreground" />;
}

/** Props for {@link TaskItem}. */
export interface TaskItemProps extends React.ComponentProps<'li'> {
  /** The step to render. */
  step: TaskStep;
}

/**
 * A single agent step. The `finish` step is styled as the distinguished final
 * answer.
 *
 * @example
 * ```tsx
 * <Task>
 *   {steps.map((s) => <TaskItem key={s.index} step={s} />)}
 * </Task>
 * ```
 */
export function TaskItem({ step, className, ...props }: TaskItemProps) {
  const status = step.status ?? 'completed';
  const isFinish = step.type === 'finish';
  const [expanded, setExpanded] = React.useState(false);

  return (
    <li
      data-slot="task-item"
      data-status={status}
      data-type={step.type}
      className={cn(
        'rounded-lg border border-border p-3 text-sm',
        isFinish ? 'border-emerald-500/40 bg-emerald-500/5' : 'bg-card',
        className,
      )}
      {...props}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-xs tabular-nums text-muted-foreground">
          {step.index + 1}
        </span>
        <StatusIcon status={status} type={step.type} />
        <span className="min-w-0 truncate font-medium text-foreground">
          {isFinish ? 'Final answer' : (step.toolName ?? 'Step')}
        </span>
      </button>

      {(expanded || isFinish) && (
        <div className="mt-2 space-y-2 pl-7">
          {step.toolArgs && (
            <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-2 text-xs">
              <code>{JSON.stringify(step.toolArgs, null, 2)}</code>
            </pre>
          )}
          {step.observation && (
            <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {step.observation}
            </p>
          )}
          {step.result && (
            <p className="whitespace-pre-wrap break-words text-sm text-foreground [overflow-wrap:anywhere]">
              {step.result}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
