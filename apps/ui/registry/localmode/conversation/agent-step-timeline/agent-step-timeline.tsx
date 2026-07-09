'use client';

/**
 * @file agent-step-timeline.tsx
 * @description A vertical timeline of ReAct agent steps. Each step is a
 * collapsible card (color-coded tool badge via an optional `toolColorMap`,
 * formatted args, observation with show-more, index, elapsed-ms). A `finish`
 * step renders a success-styled final-answer card. The timeline auto-scrolls,
 * shows a "Thinking…" spinner row while running, and a terminal finish-reason
 * badge (`max_steps` / `timeout` / `loop_detected` / `error`). It also supports
 * nested sub-agent/handoff rendering. Data source: `@localmode/react` `useAgent`.
 */
import * as React from 'react';
import {
  ChevronDown,
  CornerDownRight,
  Flag,
  Loader2,
} from 'lucide-react';
import { cn } from '@/registry/localmode/lib/utils';
import { Badge } from '@/registry/localmode/ui/badge';

/** An agent step (mirrors `@localmode/core` `AgentStep`). */
export interface AgentStep {
  index: number;
  type: 'tool_call' | 'finish';
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  observation?: string;
  result?: string;
  durationMs?: number;
  /** Optional nested sub-agent run rendered inside this step. */
  subSteps?: AgentStep[];
}

/** Terminal finish reason (mirrors `@localmode/core` `AgentFinishReason`). */
export type AgentFinishReason =
  | 'finish'
  | 'max_steps'
  | 'timeout'
  | 'loop_detected'
  | 'aborted'
  | 'error';

/** Map of tool name → Tailwind classes for the tool badge. */
export type ToolColorMap = Record<string, string>;

const DEFAULT_TOOL_COLOR = 'bg-muted text-muted-foreground';

const FINISH_REASON_META: Record<
  AgentFinishReason,
  { label: string; className: string } | null
> = {
  finish: null,
  max_steps: { label: 'Max steps reached', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  timeout: { label: 'Timed out', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  loop_detected: { label: 'Loop detected', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  aborted: { label: 'Aborted', className: 'bg-muted text-muted-foreground' },
  error: { label: 'Error', className: 'bg-destructive/15 text-destructive' },
};

/** Props for {@link AgentStepTimeline}. */
export interface AgentStepTimelineProps extends React.ComponentProps<'div'> {
  /** The agent steps (e.g. `useAgent().steps`). */
  steps: AgentStep[];
  /** Whether the agent loop is still running (e.g. `useAgent().isRunning`). */
  isRunning?: boolean;
  /** Terminal reason once the run ends. */
  finishReason?: AgentFinishReason;
  /** Optional per-tool badge colors. */
  toolColorMap?: ToolColorMap;
  /** Auto-scroll to the newest step while running. @default true */
  autoScroll?: boolean;
}

/**
 * The agent run timeline.
 *
 * @example
 * ```tsx
 * const { steps, isRunning, result } = useAgent({ model, tools });
 * <AgentStepTimeline steps={steps} isRunning={isRunning} />
 * ```
 */
export function AgentStepTimeline({
  steps,
  isRunning = false,
  finishReason,
  toolColorMap,
  autoScroll = true,
  className,
  ...props
}: AgentStepTimelineProps) {
  const endRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (autoScroll) endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [steps.length, isRunning, autoScroll]);

  const finishMeta =
    finishReason && finishReason !== 'finish'
      ? FINISH_REASON_META[finishReason]
      : null;

  return (
    <div
      data-slot="agent-step-timeline"
      data-running={isRunning || undefined}
      className={cn('space-y-3', className)}
      {...props}
    >
      {steps.map((step, i) => (
        <div key={step.index} className="flex gap-3">
          <StepNode
            variant={step.type === 'finish' ? 'finish' : 'step'}
            hasConnector={i < steps.length - 1 || isRunning}
          />
          <AgentStepCard step={step} toolColorMap={toolColorMap} className="min-w-0 flex-1" />
        </div>
      ))}

      {isRunning && (
        <div className="flex gap-3">
          <StepNode variant="running" />
          <div className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Thinking…
          </div>
        </div>
      )}

      {finishMeta && (
        <div className="flex gap-3">
          <span aria-hidden="true" className="w-3.5 shrink-0" />
          <Badge className={finishMeta.className}>{finishMeta.label}</Badge>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}

/**
 * The gutter cell: a fixed-width column holding the node dot (horizontally
 * centered) and, when `hasConnector`, a vertical line from this dot's center
 * down to the next node's center. Dot and line share the column, so they are
 * always aligned and never overlap the adjacent card.
 */
function StepNode({
  variant = 'step',
  hasConnector = false,
}: {
  variant?: 'step' | 'finish' | 'running';
  hasConnector?: boolean;
}) {
  // Step/finish dots align to the card's first text row (mt-3.5 → center 21px);
  // the connector spans 100% of this row + the 0.75rem gap to reach the next dot.
  const running = variant === 'running';
  return (
    <div className="relative flex w-3.5 shrink-0 justify-center">
      {hasConnector && (
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-[21px] h-[calc(100%+0.75rem)] w-px -translate-x-1/2 bg-border"
        />
      )}
      <span
        aria-hidden="true"
        className={cn(
          'relative z-10 size-3.5 rounded-full border bg-background',
          running ? 'mt-0.5' : 'mt-3.5',
          variant === 'finish' ? 'border-emerald-500' : 'border-border',
        )}
      />
    </div>
  );
}

/** Props for {@link AgentStepCard}. */
export interface AgentStepCardProps {
  /** The step to render. */
  step: AgentStep;
  /** Optional per-tool badge colors. */
  toolColorMap?: ToolColorMap;
  /** Render nested (sub-agent) styling. @default false */
  nested?: boolean;
  /** Extra classes merged onto the card (e.g. `min-w-0 flex-1` in the timeline). */
  className?: string;
}

/** A single collapsible step card (the node dot + connector live in the timeline gutter). */
export function AgentStepCard({
  step,
  toolColorMap,
  nested = false,
  className,
}: AgentStepCardProps) {
  const [open, setOpen] = React.useState(false);
  const [showFull, setShowFull] = React.useState(false);
  const contentId = React.useId();
  const isFinish = step.type === 'finish';
  const observation = step.observation ?? '';
  const long = observation.length > 160;
  const shown = showFull || !long ? observation : `${observation.slice(0, 160)}…`;

  return (
    <div
      data-slot="agent-step-card"
      data-type={step.type}
      className={cn(
        'rounded-lg border p-3 text-sm',
        isFinish ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border bg-card',
        nested && 'bg-muted/30',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={isFinish ? undefined : open}
        aria-controls={!isFinish && open ? contentId : undefined}
        className="flex w-full min-w-0 items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          #{step.index + 1}
        </span>
        {isFinish ? (
          <span className="inline-flex min-w-0 items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
            <Flag className="size-4 shrink-0" /> <span className="truncate">Final answer</span>
          </span>
        ) : (
          <Badge
            className={cn(
              'min-w-0 max-w-[10rem] truncate',
              toolColorMap?.[step.toolName ?? ''] ?? DEFAULT_TOOL_COLOR,
            )}
          >
            {step.toolName ?? 'step'}
          </Badge>
        )}
        {step.durationMs != null && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {step.durationMs}ms
          </span>
        )}
        {!isFinish && (
          <ChevronDown
            className={cn(
              'ml-auto size-4 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        )}
      </button>

      {isFinish && step.result && (
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground [overflow-wrap:anywhere]">
          {step.result}
        </p>
      )}

      {!isFinish && open && (
        <div id={contentId} className="mt-2 space-y-2">
          {step.toolArgs && (
            <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-2 text-xs">
              <code>{JSON.stringify(step.toolArgs, null, 2)}</code>
            </pre>
          )}
          {observation && (
            <div className="text-xs text-muted-foreground">
              <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{shown}</p>
              {long && (
                <button
                  type="button"
                  onClick={() => setShowFull((s) => !s)}
                  className="mt-1 rounded-sm underline underline-offset-2 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {showFull ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}

          {/* Nested sub-agent handoff */}
          {step.subSteps && step.subSteps.length > 0 && (
            <div className="mt-2 space-y-2 border-l-2 border-border pl-3">
              <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <CornerDownRight className="size-3" /> sub-agent
              </p>
              {step.subSteps.map((sub) => (
                <AgentStepCard key={sub.index} step={sub} toolColorMap={toolColorMap} nested />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
