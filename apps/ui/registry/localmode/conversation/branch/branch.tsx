'use client';

/**
 * @file branch.tsx
 * @description A message-versioning navigator that pages between alternative
 * regenerated/edited assistant responses for a single turn. `Branch` holds the
 * active index; `BranchMessages` shows only the active variant; `BranchSelector`
 * groups the prev/next controls and `BranchPage` indicator (hidden at N=1). It
 * wraps an existing `Message` non-intrusively. Branch state is pure client React
 * state. Data source: `useChat` (regenerated variants).
 */
import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/registry/localmode/lib/utils';
import { Button } from '@/registry/localmode/ui/button';

/** Branch navigation context. */
interface BranchContextValue {
  index: number;
  count: number;
  setIndex: (index: number) => void;
}
const BranchContext = React.createContext<BranchContextValue | null>(null);
function useBranch() {
  const ctx = React.useContext(BranchContext);
  if (!ctx) throw new Error('Branch sub-parts must be used within <Branch>');
  return ctx;
}

/** Props for {@link Branch}. */
export interface BranchProps extends React.ComponentProps<'div'> {
  /** Number of variants for this turn. */
  count: number;
  /** Default active variant index. @default last (count - 1) */
  defaultIndex?: number;
  /** Controlled active index. */
  index?: number;
  /** Reports active-index changes. */
  onIndexChange?: (index: number) => void;
}

/**
 * The branch container for a single assistant turn.
 *
 * @example
 * ```tsx
 * <Branch count={variants.length}>
 *   <BranchMessages>
 *     {variants.map((v) => <Message key={v.id} role="assistant">…</Message>)}
 *   </BranchMessages>
 *   <BranchSelector>
 *     <BranchPrevious /><BranchPage /><BranchNext />
 *   </BranchSelector>
 * </Branch>
 * ```
 */
export function Branch({
  count,
  defaultIndex,
  index: indexProp,
  onIndexChange,
  className,
  children,
  ...props
}: BranchProps) {
  const [internal, setInternal] = React.useState(
    defaultIndex ?? Math.max(0, count - 1),
  );
  const index = indexProp ?? internal;

  const setIndex = (next: number) => {
    const clamped = Math.max(0, Math.min(count - 1, next));
    onIndexChange?.(clamped);
    if (indexProp == null) setInternal(clamped);
  };

  const ctx: BranchContextValue = { index, count, setIndex };

  return (
    <BranchContext.Provider value={ctx}>
      <div data-slot="branch" className={cn('flex flex-col gap-1', className)} {...props}>
        {children}
      </div>
    </BranchContext.Provider>
  );
}

/** Props for {@link BranchMessages}. */
export type BranchMessagesProps = React.ComponentProps<'div'>;

/** Renders only the active variant from its children. */
export function BranchMessages({
  className,
  children,
  ...props
}: BranchMessagesProps) {
  const { index } = useBranch();
  const variants = React.Children.toArray(children);
  return (
    <div data-slot="branch-messages" className={className} {...props}>
      {variants[index] ?? variants[variants.length - 1] ?? null}
    </div>
  );
}

/** Props for {@link BranchSelector}. */
export type BranchSelectorProps = React.ComponentProps<'div'>;

/** Groups the prev/page/next controls. Hidden when there is only one variant. */
export function BranchSelector({
  className,
  children,
  ...props
}: BranchSelectorProps) {
  const { count } = useBranch();
  if (count <= 1) return null;
  return (
    <div
      data-slot="branch-selector"
      className={cn('flex items-center gap-1 text-xs text-muted-foreground', className)}
      {...props}
    >
      {children}
    </div>
  );
}

/** Previous-variant control. */
export function BranchPrevious({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { index, setIndex } = useBranch();
  return (
    <Button
      type="button"
      size="icon-xs"
      variant="ghost"
      aria-label="Previous variant"
      disabled={index <= 0}
      onClick={() => setIndex(index - 1)}
      data-slot="branch-previous"
      className={className}
      {...props}
    >
      <ChevronLeft className="size-3.5" />
    </Button>
  );
}

/** Next-variant control. */
export function BranchNext({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { index, count, setIndex } = useBranch();
  return (
    <Button
      type="button"
      size="icon-xs"
      variant="ghost"
      aria-label="Next variant"
      disabled={index >= count - 1}
      onClick={() => setIndex(index + 1)}
      data-slot="branch-next"
      className={className}
      {...props}
    >
      <ChevronRight className="size-3.5" />
    </Button>
  );
}

/** "X of N" page indicator. */
export function BranchPage({ className, ...props }: React.ComponentProps<'span'>) {
  const { index, count } = useBranch();
  return (
    <span
      data-slot="branch-page"
      className={cn('tabular-nums', className)}
      {...props}
    >
      {index + 1} of {count}
    </span>
  );
}
