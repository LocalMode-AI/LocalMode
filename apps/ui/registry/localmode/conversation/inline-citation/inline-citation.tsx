'use client';

/**
 * @file inline-citation.tsx
 * @description Inline numbered/superscript citation markers embedded in prose
 * that open a hovercard showing the cited LOCAL chunk (title, excerpt, quoted
 * snippet), with a carousel paging multiple sources for one claim. Distinct from
 * the list-style `SourceCitationList`. Citations reference locally-stored chunks
 * only — no remote unfurl/network. Data source: `useSemanticSearch`.
 */
import * as React from 'react';
import { ChevronLeft, ChevronRight, Quote } from 'lucide-react';
import { cn } from '@/registry/localmode/lib/utils';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/registry/localmode/ui/hover-card';

/** A cited local source/chunk. */
export interface InlineSource {
  /** Title/label of the source. */
  title: string;
  /** Short excerpt for context. */
  excerpt?: string;
  /** Exact quoted snippet supporting the claim. */
  quote?: string;
}

/** Carousel context for paging sources within a card. */
interface CarouselContextValue {
  index: number;
  count: number;
  setIndex: (i: number) => void;
}
const CarouselContext = React.createContext<CarouselContextValue | null>(null);

/** Props for {@link InlineCitation}. */
export type InlineCitationProps = React.ComponentProps<'span'>;

/** Inline wrapper for a cited span of prose. */
export function InlineCitation({ className, ...props }: InlineCitationProps) {
  return (
    <span
      data-slot="inline-citation"
      className={cn('inline', className)}
      {...props}
    />
  );
}

/** Props for {@link InlineCitationCard}. */
export type InlineCitationCardProps = React.ComponentProps<typeof HoverCard>;

/** The hovercard wrapper holding a trigger marker and a body. */
export function InlineCitationCard(props: InlineCitationCardProps) {
  return <HoverCard openDelay={120} closeDelay={80} {...props} />;
}

/** Props for {@link InlineCitationCardTrigger}. */
export interface InlineCitationCardTriggerProps
  extends React.ComponentProps<'button'> {
  /** The marker number/label (e.g. `1`). */
  label: React.ReactNode;
}

/** The superscript marker that opens the hovercard. */
export function InlineCitationCardTrigger({
  label,
  className,
  ...props
}: InlineCitationCardTriggerProps) {
  return (
    <HoverCardTrigger asChild>
      <button
        type="button"
        data-slot="inline-citation-trigger"
        className={cn(
          'relative -top-1 mr-0.5 inline-flex min-w-4 cursor-pointer items-center justify-center rounded bg-primary/15 px-1 text-[0.65rem] font-medium leading-none text-primary outline-none hover:bg-primary/25 focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
        {...props}
      >
        {label}
      </button>
    </HoverCardTrigger>
  );
}

/** Props for {@link InlineCitationCardBody}. */
export type InlineCitationCardBodyProps = React.ComponentProps<
  typeof HoverCardContent
>;

/** The hovercard body. */
export function InlineCitationCardBody({
  className,
  ...props
}: InlineCitationCardBodyProps) {
  return (
    <HoverCardContent
      data-slot="inline-citation-body"
      className={cn('w-[min(18rem,calc(100vw-2rem))] p-0', className)}
      {...props}
    />
  );
}

/** Props for {@link InlineCitationCarousel}. */
export interface InlineCitationCarouselProps
  extends React.ComponentProps<'div'> {
  /** Number of sources to page between. */
  count: number;
}

/** Pages between multiple sources for one claim. */
export function InlineCitationCarousel({
  count,
  className,
  children,
  ...props
}: InlineCitationCarouselProps) {
  const [index, setIndex] = React.useState(0);
  const items = React.Children.toArray(children);

  const ctx = React.useMemo<CarouselContextValue>(
    () => ({ index, count, setIndex }),
    [index, count],
  );

  return (
    <CarouselContext.Provider value={ctx}>
      <div data-slot="inline-citation-carousel" className={cn('p-3', className)} {...props}>
        {items[index] ?? items[0] ?? null}
        {count > 1 && (
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <button
              type="button"
              aria-label="Previous source"
              disabled={index <= 0}
              onClick={() => setIndex(Math.max(0, index - 1))}
              className="inline-flex size-6 items-center justify-center rounded-md disabled:opacity-40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="tabular-nums">
              {index + 1} / {count}
            </span>
            <button
              type="button"
              aria-label="Next source"
              disabled={index >= count - 1}
              onClick={() => setIndex(Math.min(count - 1, index + 1))}
              className="inline-flex size-6 items-center justify-center rounded-md disabled:opacity-40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>
    </CarouselContext.Provider>
  );
}

/** Props for {@link InlineCitationSource}. */
export interface InlineCitationSourceProps extends React.ComponentProps<'div'> {
  /** Source title. */
  title: string;
  /** Optional excerpt. */
  excerpt?: string;
}

/** Source title + excerpt header. */
export function InlineCitationSource({
  title,
  excerpt,
  className,
  children,
  ...props
}: InlineCitationSourceProps) {
  return (
    <div data-slot="inline-citation-source" className={cn('space-y-1', className)} {...props}>
      <p className="break-words text-sm font-medium text-foreground [overflow-wrap:anywhere]">{title}</p>
      {excerpt && <p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{excerpt}</p>}
      {children}
    </div>
  );
}

/** Props for {@link InlineCitationQuote}. */
export type InlineCitationQuoteProps = React.ComponentProps<'blockquote'>;

/** The exact quoted snippet supporting the claim. */
export function InlineCitationQuote({
  className,
  children,
  ...props
}: InlineCitationQuoteProps) {
  return (
    <blockquote
      data-slot="inline-citation-quote"
      className={cn(
        'mt-2 flex gap-1.5 border-l-2 border-border pl-2 text-xs italic text-muted-foreground',
        className,
      )}
      {...props}
    >
      <Quote className="size-3 shrink-0" />
      <span className="min-w-0 break-words [overflow-wrap:anywhere]">{children}</span>
    </blockquote>
  );
}
