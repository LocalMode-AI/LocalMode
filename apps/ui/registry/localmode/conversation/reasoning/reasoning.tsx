'use client';

/**
 * @file reasoning.tsx
 * @description The model's own thinking tokens (DeepSeek-R1 style), in a
 * collapsible region. `Reasoning` auto-expands while thinking tokens stream and
 * auto-collapses when the final answer arrives, showing an elapsed timer.
 * `ThinkingBar` is a compact one-line status strip with inline stop/expand.
 *
 * Tier of the thinking taxonomy: `ThinkingBar` (compact) → `Reasoning`
 * (free-text) → `ChainOfThought` (itemized). Distinct from `Tool` / `Task`.
 */
import * as React from 'react';
import { Brain, ChevronDown, Square } from 'lucide-react';
import { cn } from '@/registry/localmode/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/registry/localmode/ui/collapsible';

/** Reasoning open/streaming context shared with its sub-parts. */
interface ReasoningContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  streaming: boolean;
  elapsedMs: number;
}
const ReasoningContext = React.createContext<ReasoningContextValue | null>(null);
function useReasoning() {
  const ctx = React.useContext(ReasoningContext);
  if (!ctx)
    throw new Error('Reasoning sub-parts must be used within <Reasoning>');
  return ctx;
}

/** Format a millisecond duration as a short "Xs" / "Xm Ys" label. */
function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** Props for {@link Reasoning}. */
export interface ReasoningProps extends React.ComponentProps<'div'> {
  /** Whether reasoning tokens are still streaming. Drives auto-expand/collapse. */
  streaming?: boolean;
  /** Controlled open state (optional). */
  open?: boolean;
  /** Reports open changes. */
  onOpenChange?: (open: boolean) => void;
  /** Provide a fixed elapsed time (ms) instead of the internal timer. */
  durationMs?: number;
}

/**
 * Collapsible reasoning block.
 *
 * @example
 * ```tsx
 * <Reasoning streaming={isThinking}>
 *   <ReasoningTrigger />
 *   <ReasoningContent>{thinkTokens}</ReasoningContent>
 * </Reasoning>
 * ```
 */
export function Reasoning({
  streaming = false,
  open: openProp,
  onOpenChange,
  durationMs,
  className,
  children,
  ...props
}: ReasoningProps) {
  const [internalOpen, setInternalOpen] = React.useState(streaming);
  const [elapsedMs, setElapsedMs] = React.useState(durationMs ?? 0);
  const startRef = React.useRef<number | null>(null);

  const open = openProp ?? internalOpen;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (openProp == null) setInternalOpen(next);
  };

  // Auto-expand while streaming; auto-collapse once it stops (unless controlled).
  React.useEffect(() => {
    if (openProp != null) return;
    if (streaming) setInternalOpen(true);
    else setInternalOpen(false);
  }, [streaming, openProp]);

  // Elapsed timer while streaming.
  React.useEffect(() => {
    if (durationMs != null) {
      setElapsedMs(durationMs);
      return;
    }
    if (!streaming) return;
    startRef.current = performance.now();
    const id = window.setInterval(() => {
      if (startRef.current != null) {
        setElapsedMs(performance.now() - startRef.current);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [streaming, durationMs]);

  const ctx: ReasoningContextValue = { open, setOpen, streaming, elapsedMs };

  return (
    <ReasoningContext.Provider value={ctx}>
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        data-slot="reasoning"
        data-streaming={streaming || undefined}
        className={cn(
          'rounded-lg border border-border bg-muted/30 text-sm',
          className,
        )}
        {...props}
      >
        {children}
      </Collapsible>
    </ReasoningContext.Provider>
  );
}

/** Props for {@link ReasoningTrigger}. */
export interface ReasoningTriggerProps extends React.ComponentProps<'button'> {
  /** Label override. Defaults to "Thinking…" while streaming, else "Reasoning". */
  label?: string;
}

/** The collapsible header showing a thinking indicator + elapsed time. */
export function ReasoningTrigger({
  label,
  className,
  ...props
}: ReasoningTriggerProps) {
  const { open, streaming, elapsedMs } = useReasoning();
  return (
    <CollapsibleTrigger
      data-slot="reasoning-trigger"
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2 text-left text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        className,
      )}
      {...props}
    >
      <Brain className={cn('size-4 shrink-0', streaming && 'animate-pulse')} />
      <span className="min-w-0 truncate font-medium">
        {label ?? (streaming ? 'Thinking…' : 'Reasoning')}
      </span>
      {elapsedMs > 0 && (
        <span className="shrink-0 text-xs tabular-nums">{formatElapsed(elapsedMs)}</span>
      )}
      <ChevronDown
        className={cn(
          'ml-auto size-4 transition-transform',
          open && 'rotate-180',
        )}
      />
    </CollapsibleTrigger>
  );
}

/** Props for {@link ReasoningContent}. */
export type ReasoningContentProps = React.ComponentProps<'div'>;

/** The reasoning token body. */
export function ReasoningContent({
  className,
  children,
  ...props
}: ReasoningContentProps) {
  return (
    <CollapsibleContent data-slot="reasoning-content">
      <div
        className={cn(
          'whitespace-pre-wrap break-words px-3 pb-3 text-muted-foreground [overflow-wrap:anywhere]',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </CollapsibleContent>
  );
}

/** Props for {@link ThinkingBar}. */
export interface ThinkingBarProps extends React.ComponentProps<'div'> {
  /** Status text. @default "Thinking" */
  label?: string;
  /** Elapsed milliseconds to display. */
  elapsedMs?: number;
  /** Show the inline expand control. */
  onExpand?: () => void;
  /** Show the inline stop control. */
  onStop?: () => void;
}

/**
 * Compact one-line "thinking now" status strip with inline stop/expand —
 * the most condensed tier of the thinking taxonomy.
 */
export function ThinkingBar({
  label = 'Thinking',
  elapsedMs,
  onExpand,
  onStop,
  className,
  ...props
}: ThinkingBarProps) {
  return (
    <div
      data-slot="thinking-bar"
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground',
        className,
      )}
      {...props}
    >
      <Brain className="size-3.5 shrink-0 animate-pulse" />
      <span className="min-w-0 truncate font-medium">{label}</span>
      {elapsedMs != null && elapsedMs > 0 && (
        <span className="tabular-nums">{formatElapsed(elapsedMs)}</span>
      )}
      {onExpand && (
        <button
          type="button"
          onClick={onExpand}
          className="shrink-0 rounded-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          expand
        </button>
      )}
      {onStop && (
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop thinking"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-destructive/30 text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-destructive/30"
        >
          <Square className="size-2.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
