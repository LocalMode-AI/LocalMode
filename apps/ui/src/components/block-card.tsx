/**
 * @file block-card.tsx
 * @description Presentational gallery card for one block on the `/blocks` index.
 * Styled with shadcn/ui CSS-variable tokens ONLY (no daisyUI, no poster-* tokens,
 * no import from the retired showcase app) so it is fully theme-aware in
 * light and dark. Layout hierarchy (icon + title, description, feature chips,
 * model badge) is translated from the retired showcase AppCard, not copied.
 * The whole card is a link to the block's canonical route.
 */
import Link from 'next/link';
import { Download, CircleOff, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BlockCardData, BlockCategoryAccent } from '@/app/blocks/blocks-catalog';

/** Props for {@link BlockCard}. */
export interface BlockCardProps {
  /** The card's block data. */
  card: BlockCardData;
  /** The owning category's theme-aware gradient accent. */
  accent: BlockCategoryAccent;
}

/**
 * A single block card: icon, title, one-line description, up to three feature
 * chips, and a model-weight badge.
 */
export function BlockCard({ card }: BlockCardProps) {
  const Icon = card.icon;
  const noDownload = card.modelBadge === 'No download';

  return (
    <Link
      href={card.route}
      data-block-link={card.route}
      aria-label={`Open ${card.title}`}
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card p-4',
        'transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      )}
    >
      <div className="relative flex h-full flex-col gap-3">
        {/* Header: icon + title */}
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-5" aria-hidden="true" />
          </div>
          <h3 className="line-clamp-1 text-base font-semibold text-foreground transition-colors group-hover:text-primary">
            {card.title}
          </h3>
          <ArrowUpRight
            className="ml-auto size-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-primary"
            aria-hidden="true"
          />
        </div>

        {/* One-line description */}
        <p className="line-clamp-2 min-h-10 text-sm leading-relaxed text-muted-foreground">
          {card.description}
        </p>

        {/* Feature chips + model badge */}
        <div className="mt-auto flex flex-col gap-3 pt-2">
          <div className="flex flex-wrap gap-1.5">
            {card.chips.slice(0, 3).map((chip) => (
              <span
                key={chip}
                className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
              >
                {chip}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-1.5 border-t border-border pt-3">
            {noDownload ? (
              <CircleOff className="size-3 text-muted-foreground" aria-hidden />
            ) : (
              <Download className="size-3 text-muted-foreground" aria-hidden />
            )}
            <span className="font-mono text-[11px] text-muted-foreground">{card.modelBadge}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
