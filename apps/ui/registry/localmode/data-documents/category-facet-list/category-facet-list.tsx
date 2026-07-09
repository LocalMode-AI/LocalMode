'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Props for {@link CategoryFacetList}. */
export interface CategoryFacetListProps {
  /** The category values to render, in display order. */
  categories: string[];
  /**
   * Per-category item counts, keyed by category. Missing keys render `0`. Pass
   * `false` to hide count badges entirely.
   */
  counts?: Record<string, number> | false;
  /**
   * The currently selected category, or `null` when none is selected ("All").
   * Single-select: re-selecting the active category deselects it.
   */
  selected: string | null;
  /**
   * Called with the next selection: the clicked category, or `null` when the
   * active category is re-clicked or "All" is activated.
   */
  onSelect: (category: string | null) => void;
  /**
   * Layout: a vertical list (default) or a wrapping row of pills.
   * @default "list"
   */
  variant?: 'list' | 'pills';
  /**
   * Label for the clear-selection affordance.
   * @default "All"
   */
  allLabel?: string;
  /**
   * Show the "All"/clear affordance.
   * @default true
   */
  showAll?: boolean;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * A domain-decoupled, filterable category facet. Renders a single-select list
 * or pill row with per-category count badges, an active highlight, and an
 * "All"/clear affordance. Re-clicking the active category deselects it.
 *
 * It takes `categories` + `counts` + `selected` + `onSelect`, so it serves any
 * facet source: `useSemanticSearch` result metadata, zero-shot classification
 * labels, NER entity types, or document categories alike.
 *
 * Styled with shadcn/ui CSS variables so it inherits the consumer's theme.
 *
 * @example
 * ```tsx
 * const counts = results.reduce<Record<string, number>>((acc, r) => {
 *   const c = String(r.metadata.category ?? 'uncategorized');
 *   acc[c] = (acc[c] ?? 0) + 1;
 *   return acc;
 * }, {});
 *
 * <CategoryFacetList
 *   categories={Object.keys(counts)}
 *   counts={counts}
 *   selected={selected}
 *   onSelect={setSelected}
 * />
 * ```
 */
export function CategoryFacetList({
  categories,
  counts,
  selected,
  onSelect,
  variant = 'list',
  allLabel = 'All',
  showAll = true,
  className,
}: CategoryFacetListProps) {
  const countMap = counts === false ? undefined : counts;
  const showCounts = counts !== false;
  const countFor = (c: string) => countMap?.[c] ?? 0;
  const total = showCounts
    ? categories.reduce((sum, c) => sum + countFor(c), 0)
    : undefined;

  /** Toggle behaviour: re-clicking the active item clears the selection. */
  const handleClick = (category: string) => {
    onSelect(selected === category ? null : category);
  };

  if (variant === 'pills') {
    return (
      <div
        role="group"
        aria-label="Filter by category"
        className={cn('flex flex-wrap gap-2', className)}
      >
        {showAll && (
          <Pill
            label={allLabel}
            count={total}
            active={selected === null}
            onClick={() => onSelect(null)}
          />
        )}
        {categories.map((category) => (
          <Pill
            key={category}
            label={category}
            count={showCounts ? countFor(category) : undefined}
            active={selected === category}
            onClick={() => handleClick(category)}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="Filter by category"
      className={cn('flex flex-col gap-0.5', className)}
    >
      {showAll && (
        <Row
          label={allLabel}
          count={total}
          active={selected === null}
          onClick={() => onSelect(null)}
        />
      )}
      {categories.map((category) => (
        <Row
          key={category}
          label={category}
          count={showCounts ? countFor(category) : undefined}
          active={selected === category}
          onClick={() => handleClick(category)}
        />
      ))}
    </div>
  );
}

/** A single vertical-list facet row. */
function Row({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        active
          ? 'bg-accent font-medium text-accent-foreground'
          : 'text-foreground hover:bg-accent/50',
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <Check
          className={cn('size-3.5 shrink-0', active ? 'opacity-100' : 'opacity-0')}
          aria-hidden="true"
        />
        <span className="truncate">{label}</span>
      </span>
      {count !== undefined && (
        <span
          className={cn(
            'shrink-0 rounded-full px-1.5 py-0.5 text-xs tabular-nums',
            active
              ? 'bg-primary/15 text-primary'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/** A single horizontal-pill facet. */
function Pill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-card-foreground hover:bg-accent',
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      {count !== undefined && (
        <span
          className={cn(
            'rounded-full px-1.5 text-[0.65rem] tabular-nums',
            active ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
