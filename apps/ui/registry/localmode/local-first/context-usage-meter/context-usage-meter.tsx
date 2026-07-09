'use client';

import { createContext, useContext, type ReactNode } from 'react';

import { cn } from '@/registry/localmode/lib/utils';

/** Token usage breakdown against a context window. No cost field — local models have no billing. */
export interface ContextUsage {
  /** Prompt / input tokens. */
  inputTokens?: number;
  /** Generated / output tokens. */
  outputTokens?: number;
  /** Reasoning ("thinking") tokens, if the model emits them. */
  reasoningTokens?: number;
  /** Tokens served from the prompt cache. */
  cachedTokens?: number;
}

interface ContextValue {
  usage: ContextUsage;
  /** Total context-window limit in tokens (hard GGUF / LiteRT KV-cache constraint). */
  contextWindow: number;
  /** Fraction (0–1) past which the meter warns. */
  warnThreshold: number;
}

const Ctx = createContext<ContextValue | null>(null);

function useCtx(component: string): ContextValue {
  const value = useContext(Ctx);
  if (!value) {
    throw new Error(`<${component}> must be used within <Context>.`);
  }
  return value;
}

/** Sum the tracked usage fields (cached is part of input, not added twice). */
function totalUsed(usage: ContextUsage): number {
  return (
    (usage.inputTokens ?? 0) +
    (usage.outputTokens ?? 0) +
    (usage.reasoningTokens ?? 0)
  );
}

/** Props for {@link Context}. */
export interface ContextProps {
  /** Token usage breakdown (e.g. from a generate result's `usage`). */
  usage: ContextUsage;
  /** The model's context-window limit in tokens. */
  contextWindow: number;
  /** Fraction (0–1) at which the meter warns. @default 0.85 */
  warnThreshold?: number;
  /** Compound children (`ContextTrigger`, `ContextContent`, …). */
  children: ReactNode;
}

/**
 * Provider/root for the context-usage compound. Shares token `usage` and the
 * model's `contextWindow` with the child parts. Local-only: there is no cloud
 * cost concept, so the meter never shows a price.
 *
 * @example
 * ```tsx
 * <Context usage={result.usage} contextWindow={8192}>
 *   <ContextTrigger />
 *   <ContextContent>
 *     <ContextInputUsage />
 *     <ContextOutputUsage />
 *   </ContextContent>
 * </Context>
 * ```
 */
export function Context({
  usage,
  contextWindow,
  warnThreshold = 0.85,
  children,
}: ContextProps) {
  return (
    <Ctx.Provider value={{ usage, contextWindow, warnThreshold }}>
      <div className="inline-flex flex-col gap-2">{children}</div>
    </Ctx.Provider>
  );
}

/** Props for {@link ContextTrigger}. */
export interface ContextTriggerProps {
  /** Additional class names merged onto the trigger. */
  className?: string;
}

/**
 * A compact ring + percentage summarizing how full the context window is.
 * Turns amber past the warn threshold.
 */
export function ContextTrigger({ className }: ContextTriggerProps) {
  const { usage, contextWindow, warnThreshold } = useCtx('ContextTrigger');
  const used = totalUsed(usage);
  const fraction = contextWindow > 0 ? Math.min(1, used / contextWindow) : 0;
  const percent = Math.round(fraction * 100);
  const warning = fraction >= warnThreshold;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-card-foreground',
        className,
      )}
    >
      <span
        className="relative inline-flex size-4 items-center justify-center rounded-full"
        style={{
          background: `conic-gradient(${
            warning ? 'var(--color-amber-500, #f59e0b)' : 'var(--primary)'
          } ${percent}%, var(--muted) 0)`,
        }}
        aria-hidden="true"
      >
        <span className="size-2.5 rounded-full bg-card" />
      </span>
      <span className={cn('tabular-nums', warning && 'text-amber-600 dark:text-amber-400')}>
        {used.toLocaleString()} / {contextWindow.toLocaleString()} ctx
      </span>
    </div>
  );
}

/** Props for {@link ContextContent}. */
export interface ContextContentProps {
  /** The usage breakdown rows. */
  children: ReactNode;
  /** Additional class names merged onto the panel. */
  className?: string;
}

/** A panel that holds the detailed token-usage rows. */
export function ContextContent({ children, className }: ContextContentProps) {
  return (
    <div
      className={cn(
        'flex w-56 flex-col gap-1 rounded-lg border border-border bg-card p-3 text-xs text-card-foreground',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface UsageRowProps {
  label: string;
  value: number;
  contextWindow: number;
}

function UsageRow({ label, value, contextWindow }: UsageRowProps) {
  const fraction = contextWindow > 0 ? Math.min(1, value / contextWindow) : 0;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{value.toLocaleString()}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.round(fraction * 100)}%` }}
        />
      </div>
    </div>
  );
}

/** Input + cached token rows of the breakdown. */
export function ContextInputUsage({ className }: { className?: string }) {
  const { usage, contextWindow } = useCtx('ContextInputUsage');
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <UsageRow label="Input" value={usage.inputTokens ?? 0} contextWindow={contextWindow} />
      {usage.cachedTokens != null && (
        <UsageRow label="Cached" value={usage.cachedTokens} contextWindow={contextWindow} />
      )}
    </div>
  );
}

/** Output + reasoning token rows of the breakdown. */
export function ContextOutputUsage({ className }: { className?: string }) {
  const { usage, contextWindow } = useCtx('ContextOutputUsage');
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <UsageRow label="Output" value={usage.outputTokens ?? 0} contextWindow={contextWindow} />
      {usage.reasoningTokens != null && (
        <UsageRow
          label="Reasoning"
          value={usage.reasoningTokens}
          contextWindow={contextWindow}
        />
      )}
    </div>
  );
}

/** Props for {@link ContextUsageMeter}. */
export interface ContextUsageMeterProps extends ContextUsage {
  /** The model's context-window limit in tokens. */
  contextWindow: number;
  /** Fraction (0–1) at which the meter warns. @default 0.85 */
  warnThreshold?: number;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * A token / context-window budget meter for local generation: a bar breaking
 * down input / output / reasoning / cache token usage against the model's
 * context-window limit (a hard local GGUF/LiteRT KV-cache constraint), warning
 * as it approaches the limit. Feed it `usage.tokens` from a generate result.
 * Local-only — there is **no cost field**. Complements `StorageMeter` (disk)
 * with a token-budget gauge.
 *
 * For a composable hovercard layout, use the lower-level `Context` /
 * `ContextTrigger` / `ContextContent` / `ContextInputUsage` /
 * `ContextOutputUsage` parts directly.
 *
 * @example
 * ```tsx
 * <ContextUsageMeter inputTokens={1200} outputTokens={300} contextWindow={8192} />
 * ```
 */
export function ContextUsageMeter({
  contextWindow,
  warnThreshold = 0.85,
  className,
  ...usage
}: ContextUsageMeterProps) {
  const used = totalUsed(usage);
  const fraction = contextWindow > 0 ? Math.min(1, used / contextWindow) : 0;
  const percent = Math.round(fraction * 100);
  const warning = fraction >= warnThreshold;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex w-full max-w-xs flex-col gap-2 rounded-lg border border-border bg-card p-3 text-card-foreground',
        className,
      )}
    >
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">Context usage</span>
        <span
          className={cn(
            'tabular-nums',
            warning ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
          )}
        >
          {used.toLocaleString()} / {contextWindow.toLocaleString()}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            warning ? 'bg-amber-500' : 'bg-primary',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        {usage.inputTokens != null && <span>In {usage.inputTokens.toLocaleString()}</span>}
        {usage.outputTokens != null && <span>Out {usage.outputTokens.toLocaleString()}</span>}
        {usage.reasoningTokens != null && (
          <span>Reasoning {usage.reasoningTokens.toLocaleString()}</span>
        )}
        {usage.cachedTokens != null && <span>Cached {usage.cachedTokens.toLocaleString()}</span>}
      </div>
      {warning && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          Approaching the context-window limit.
        </p>
      )}
    </div>
  );
}
