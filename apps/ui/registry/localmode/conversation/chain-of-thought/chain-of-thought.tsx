'use client';

/**
 * @file chain-of-thought.tsx
 * @description A structured step-by-step reasoning timeline (distinct from
 * free-text `Reasoning`): discrete labeled steps with per-step status
 * (complete / active / pending), custom icons, and nested content slots for
 * embedded retrieved sources and images. It collapses to a single line on
 * completion. Data source: `useGenerateText` reasoning-mode (`<think>` step
 * traces) + local RAG retrieval.
 */
import * as React from 'react';
import {
  Brain,
  Check,
  ChevronDown,
  Circle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/registry/localmode/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/registry/localmode/ui/collapsible';

/** Per-step status. */
export type ChainStepStatus = 'pending' | 'active' | 'complete';

/** Open/done context for the chain. */
interface ChainContextValue {
  open: boolean;
  setOpen: (o: boolean) => void;
  done: boolean;
}
const ChainContext = React.createContext<ChainContextValue | null>(null);
function useChain() {
  const ctx = React.useContext(ChainContext);
  if (!ctx)
    throw new Error('ChainOfThought sub-parts must be used within <ChainOfThought>');
  return ctx;
}

/** Props for {@link ChainOfThought}. */
export interface ChainOfThoughtProps extends React.ComponentProps<'div'> {
  /** When true, the chain collapses to a single summary line. @default false */
  done?: boolean;
  /** Controlled open state. */
  open?: boolean;
  /** Reports open changes. */
  onOpenChange?: (open: boolean) => void;
}

/**
 * The itemized reasoning timeline.
 *
 * @example
 * ```tsx
 * <ChainOfThought done={!isStreaming}>
 *   <ChainOfThoughtHeader />
 *   <ChainOfThoughtContent>
 *     <ChainOfThoughtStep label="Search local docs" status="complete" />
 *     <ChainOfThoughtStep label="Synthesize answer" status="active" />
 *   </ChainOfThoughtContent>
 * </ChainOfThought>
 * ```
 */
export function ChainOfThought({
  done = false,
  open: openProp,
  onOpenChange,
  className,
  children,
  ...props
}: ChainOfThoughtProps) {
  const [internalOpen, setInternalOpen] = React.useState(true);
  const open = openProp ?? (done ? internalOpen : true);

  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (openProp == null) setInternalOpen(next);
  };

  // Auto-collapse once done (unless controlled).
  React.useEffect(() => {
    if (openProp == null && done) setInternalOpen(false);
  }, [done, openProp]);

  const ctx: ChainContextValue = { open, setOpen, done };

  return (
    <ChainContext.Provider value={ctx}>
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        data-slot="chain-of-thought"
        data-done={done || undefined}
        className={cn('rounded-lg border border-border bg-muted/20 text-sm', className)}
        {...props}
      >
        {children}
      </Collapsible>
    </ChainContext.Provider>
  );
}

/** Props for {@link ChainOfThoughtHeader}. */
export interface ChainOfThoughtHeaderProps
  extends React.ComponentProps<'button'> {
  /** Header label. @default "Chain of thought" */
  label?: string;
}

/** The collapsible header / summary line. */
export function ChainOfThoughtHeader({
  label = 'Chain of thought',
  className,
  ...props
}: ChainOfThoughtHeaderProps) {
  const { open, done } = useChain();
  return (
    <CollapsibleTrigger
      data-slot="chain-of-thought-header"
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2 text-left text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        className,
      )}
      {...props}
    >
      <Brain className={cn('size-4 shrink-0', !done && 'animate-pulse')} />
      <span className="min-w-0 truncate font-medium">{label}</span>
      <ChevronDown
        className={cn('ml-auto size-4 transition-transform', open && 'rotate-180')}
      />
    </CollapsibleTrigger>
  );
}

/** Props for {@link ChainOfThoughtContent}. */
export type ChainOfThoughtContentProps = React.ComponentProps<'div'>;

/** The steps body. */
export function ChainOfThoughtContent({
  className,
  ...props
}: ChainOfThoughtContentProps) {
  return (
    <CollapsibleContent data-slot="chain-of-thought-content">
      <div className={cn('space-y-3 px-3 pt-1 pb-3', className)} {...props} />
    </CollapsibleContent>
  );
}

/** Props for {@link ChainOfThoughtStep}. */
export interface ChainOfThoughtStepProps extends React.ComponentProps<'div'> {
  /** Step label. */
  label: string;
  /** Per-step status. @default "complete" */
  status?: ChainStepStatus;
  /** Optional custom leading icon (overrides the status icon). */
  icon?: React.ReactNode;
}

/** A single labeled reasoning step (may host nested slots as children). */
export function ChainOfThoughtStep({
  label,
  status = 'complete',
  icon,
  className,
  children,
  ...props
}: ChainOfThoughtStepProps) {
  const statusIcon =
    icon ??
    (status === 'active' ? (
      <Loader2 className="size-3.5 animate-spin text-blue-500" />
    ) : status === 'complete' ? (
      <Check className="size-3.5 text-emerald-500" />
    ) : (
      <Circle className="size-3.5 text-muted-foreground" />
    ));

  return (
    <div
      data-slot="chain-of-thought-step"
      data-status={status}
      className={cn('flex items-start gap-2', className)}
      {...props}
    >
      <span className="mt-0.5 shrink-0">{statusIcon}</span>
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium text-foreground [overflow-wrap:anywhere]">{label}</p>
        {children && <div className="mt-1.5 space-y-1.5">{children}</div>}
      </div>
    </div>
  );
}

/** Props for {@link ChainOfThoughtSearchResults}. */
export type ChainOfThoughtSearchResultsProps = React.ComponentProps<'div'>;

/** A container for embedded retrieved sources within a step. */
export function ChainOfThoughtSearchResults({
  className,
  ...props
}: ChainOfThoughtSearchResultsProps) {
  return (
    <div
      data-slot="chain-of-thought-search-results"
      className={cn('flex flex-wrap gap-1.5', className)}
      {...props}
    />
  );
}

/** Props for {@link ChainOfThoughtSearchResult}. */
export interface ChainOfThoughtSearchResultProps
  extends React.ComponentProps<'span'> {
  /** The result label/title. */
  children: React.ReactNode;
}

/** A single retrieved-source chip embedded in a step. */
export function ChainOfThoughtSearchResult({
  className,
  ...props
}: ChainOfThoughtSearchResultProps) {
  return (
    <span
      data-slot="chain-of-thought-search-result"
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

/** Props for {@link ChainOfThoughtImage}. */
export interface ChainOfThoughtImageProps
  extends React.ComponentProps<'figure'> {
  /** Image src (local data/object URL). */
  src: string;
  /** Alt text. */
  alt?: string;
  /** Optional caption. */
  caption?: string;
}

/** An embedded image slot within a step. */
export function ChainOfThoughtImage({
  src,
  alt = '',
  caption,
  className,
  ...props
}: ChainOfThoughtImageProps) {
  return (
    <figure
      data-slot="chain-of-thought-image"
      className={cn('overflow-hidden rounded-md border border-border', className)}
      {...props}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="max-h-40 max-w-full object-contain" />
      {caption && (
        <figcaption className="px-2 py-1 text-xs text-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
