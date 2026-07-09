'use client';

/**
 * @file suggestions.tsx
 * @description A horizontal row of selectable prompt chips. `Suggestions` is the
 * scrollable rail; each `Suggestion` invokes a callback with its text — wire it
 * to your composer's send/value to seed the input.
 */
import * as React from 'react';
import { cn } from '@/registry/localmode/lib/utils';
import { Button } from '@/registry/localmode/ui/button';

/** Props for {@link Suggestions}. */
export type SuggestionsProps = React.ComponentProps<'div'>;

/**
 * Scrollable row of suggestion chips. A right-edge fade mask signals that the
 * rail scrolls horizontally when chips overflow the container width.
 */
export function Suggestions({ className, ...props }: SuggestionsProps) {
  return (
    <div
      data-slot="suggestions"
      className={cn(
        'flex w-full gap-2 overflow-x-auto pb-1 pr-6',
        '[mask-image:linear-gradient(to_right,black_calc(100%_-_2rem),transparent)] [-webkit-mask-image:linear-gradient(to_right,black_calc(100%_-_2rem),transparent)]',
        className,
      )}
      {...props}
    />
  );
}

/** Props for {@link Suggestion}. */
export interface SuggestionProps
  extends Omit<React.ComponentProps<typeof Button>, 'onClick' | 'onSelect'> {
  /** The suggestion text (also the default label). */
  suggestion: string;
  /** Invoked with the suggestion text on activation. */
  onSelect?: (suggestion: string) => void;
}

/**
 * A single prompt chip.
 *
 * @example
 * ```tsx
 * <Suggestions>
 *   {prompts.map((p) => (
 *     <Suggestion key={p} suggestion={p} onSelect={setInput} />
 *   ))}
 * </Suggestions>
 * ```
 */
export function Suggestion({
  suggestion,
  onSelect,
  className,
  children,
  ...props
}: SuggestionProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-slot="suggestion"
      onClick={() => onSelect?.(suggestion)}
      className={cn('max-w-[min(22rem,80vw)] shrink-0 rounded-full text-xs [&>span]:truncate', className)}
      {...props}
    >
      {children ?? suggestion}
    </Button>
  );
}
