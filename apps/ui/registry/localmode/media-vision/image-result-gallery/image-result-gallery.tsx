'use client';

import * as React from 'react';
import { Check, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/registry/localmode/lib/utils';

/**
 * Staggered fade-in keyframes, shipped inline so the gallery works standalone
 * after `shadcn add` (no animation plugin required).
 */
const FADE_IN_KEYFRAMES = `
@keyframes lm-card-in {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}
`;

/**
 * One image result card. Grid and list layouts share this single contract, so
 * apps switch layout without reshaping data. Populated from
 * `useClassifyImageZeroShot` / `useEmbedImage` / `useCaptionImage` output.
 */
export interface ImageResultCard {
  /** Stable identifier (used as the React key + selection/delete handle). */
  id: string;
  /** Image source (data URL or URL). */
  src: string;
  /** Primary label/caption (e.g. top class, generated caption). */
  label?: string;
  /** Secondary category/tag shown in the card metadata. */
  category?: string;
  /** Confidence score in `[0, 1]`. When set, a score badge is shown. */
  score?: number;
  /** When true, render the per-card in-flight processing overlay. */
  processing?: boolean;
}

/**
 * Lower-bound thresholds (inclusive, on the 0–1 score) for the per-card badge
 * color tiers. Tune these when scores don't span the full 0–1 range — e.g.
 * cross-modal CLIP similarity typically lands in ~0.15–0.35, so passing
 * `{ high: 0.35, medium: 0.2 }` keeps strong matches from rendering as a red
 * "low" badge.
 */
export interface ScoreThresholds {
  /** Scores at or above this render as the high (emerald) tier. @default 0.8 */
  high?: number;
  /** Scores at or above this (but below `high`) render as the medium (amber) tier. @default 0.5 */
  medium?: number;
}

/** Props for {@link ImageResultGallery}. */
export interface ImageResultGalleryProps {
  /** The cards to render. */
  cards: ImageResultCard[];
  /** Layout. @default "grid" */
  layout?: 'grid' | 'list';
  /** Currently-selected card ids (controlled multi-select). */
  selectedIds?: string[];
  /**
   * Score-tier breakpoints for the per-card badge color. The default suits
   * softmax probabilities (0–1); override it for compressed score ranges such
   * as cross-modal CLIP similarity (~0.15–0.35).
   * @default { high: 0.8, medium: 0.5 }
   */
  scoreThresholds?: ScoreThresholds;
  /** Called with a card id when its selection checkbox is toggled. */
  onSelect?: (id: string, selected: boolean) => void;
  /** Called with a card id when its delete affordance is clicked. */
  onDelete?: (id: string) => void;
  /** Additional class names merged onto the root. */
  className?: string;
}

/** Resolved (defaulted) score-tier breakpoints. */
type ResolvedScoreThresholds = { high: number; medium: number };

/**
 * A minimal confidence-score badge — a self-contained fallback so this family
 * builds independently. When you also install
 * `@localmode/ui/results/confidence-score-badge`, swap this for that richer
 * component (declared as a `registryDependency`).
 */
function ScoreBadge({
  score,
  thresholds,
}: {
  score: number;
  thresholds: ResolvedScoreThresholds;
}) {
  const pct = Math.round(score * 100);
  const tone =
    score >= thresholds.high
      ? 'bg-emerald-500/90'
      : score >= thresholds.medium
        ? 'bg-amber-500/90'
        : 'bg-rose-500/90';
  return (
    <span
      className={cn(
        'inline-flex h-[20px] items-center rounded-full px-2 text-[0.625rem] font-semibold tabular-nums text-white',
        tone,
      )}
    >
      {pct}%
    </span>
  );
}

/** A single result card, used by both grid and list layouts. */
function ResultCard({
  card,
  index,
  layout,
  selected,
  thresholds,
  onSelect,
  onDelete,
}: {
  card: ImageResultCard;
  index: number;
  layout: 'grid' | 'list';
  selected: boolean;
  thresholds: ResolvedScoreThresholds;
  onSelect?: (id: string, selected: boolean) => void;
  onDelete?: (id: string) => void;
}) {
  const isList = layout === 'list';

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-lg border border-border bg-card transition-all',
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        isList && 'flex items-center gap-4',
      )}
      style={{
        // Staggered fade-in (keyframes shipped inline below).
        animation: `lm-card-in 0.35s ease-out both`,
        animationDelay: `${Math.min(index * 60, 480)}ms`,
      }}
    >
      <div
        className={cn(
          'relative overflow-hidden bg-muted',
          isList ? 'size-20 shrink-0 rounded-md' : 'aspect-square w-full',
        )}
      >
        {/* Intrinsic square dimensions reserve the aspect ratio (belt-and-braces
            against CLS on top of the aspect-square / size-20 container); the
            image is lazy-loaded and decoded off the main thread. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={card.src}
          alt={card.label ?? ''}
          width={512}
          height={512}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />

        {/* In-flight per-card overlay. */}
        {card.processing && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
            <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />
          </div>
        )}

        {/* Persistent metadata caption (grid only — list shows it inline).
            Visible at rest on every viewport so filename / category / score are
            scannable without a hover — keyboard-, touch- and AT-reachable — with
            a gradient that keeps the white text legible over any image. */}
        {!isList && (card.label || card.category || card.score != null) && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/80 via-black/45 to-transparent p-2">
            {card.label && (
              <span className="truncate text-xs font-medium text-white">
                {card.label}
              </span>
            )}
            {(card.category || card.score != null) && (
              <div className="flex items-center gap-1.5">
                {card.category && (
                  <span className="inline-flex h-[20px] max-w-full items-center rounded-full bg-white/20 px-1.5 text-[0.625rem] font-medium text-white">
                    <span className="truncate">{card.category}</span>
                  </span>
                )}
                {card.score != null && (
                  <ScoreBadge score={card.score} thresholds={thresholds} />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* List metadata column. */}
      {isList && (
        <div className="min-w-0 flex-1 py-2 pr-3">
          {card.label && (
            <p className="truncate text-sm font-medium text-foreground">
              {card.label}
            </p>
          )}
          <div className="mt-1 flex items-center gap-1.5">
            {card.category && (
              <span className="inline-flex h-[20px] items-center rounded-full bg-muted px-1.5 text-[0.625rem] font-medium text-muted-foreground">
                {card.category}
              </span>
            )}
            {card.score != null && (
              <ScoreBadge score={card.score} thresholds={thresholds} />
            )}
          </div>
        </div>
      )}

      {/* Multi-select checkbox. */}
      {onSelect && (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={selected ? 'Deselect image' : 'Select image'}
          onClick={() => onSelect(card.id, !selected)}
          className={cn(
            'absolute left-2 top-2 flex size-5 items-center justify-center rounded-md border transition-all',
            selected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-background/80 text-transparent backdrop-blur-sm hover:border-primary',
            // Stay visible when selected; otherwise hover-reveal on desktop with a
            // faint resting state on touch (so it's discoverable without a hover).
            !selected &&
              !isList &&
              'opacity-60 sm:opacity-0 sm:group-hover:opacity-100',
          )}
        >
          <Check className="size-3.5" aria-hidden="true" />
        </button>
      )}

      {/* Delete affordance. */}
      {onDelete && (
        <button
          type="button"
          aria-label="Delete image"
          onClick={() => onDelete(card.id)}
          className={cn(
            'absolute right-2 top-2 flex size-6 items-center justify-center rounded-md border border-border bg-background/80 text-muted-foreground backdrop-blur-sm transition-all hover:border-destructive hover:text-destructive',
            // Always visible in list; in grid, hover-reveal on desktop with a
            // faint resting state on touch so it stays discoverable.
            isList
              ? 'static ml-auto mr-3'
              : 'opacity-60 sm:opacity-0 sm:group-hover:opacity-100',
          )}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/**
 * A responsive grid/list of image result cards. Each card shows the image in an
 * aspect container, an in-flight processing overlay, a persistent metadata
 * caption (filename + category badge + score badge) that stays visible at rest
 * on every viewport, a multi-select checkbox, and a delete affordance, with a
 * staggered fade-in. Grid and list layouts share one data contract
 * ({@link ImageResultCard}), so apps switch layout without reshaping data.
 *
 * Per-card scores render through a self-contained fallback badge whose color
 * tiers are configurable via `scoreThresholds` — pass CLIP-scaled breakpoints
 * (e.g. `{ high: 0.35, medium: 0.2 }`) so cross-modal similarity results aren't
 * misread as failures. When `@localmode/ui/results/confidence-score-badge` is
 * also installed you can swap the internal `ScoreBadge` for it (declared as a
 * `registryDependency`).
 *
 * @example
 * ```tsx
 * <ImageResultGallery
 *   cards={results}
 *   layout="grid"
 *   selectedIds={selected}
 *   scoreThresholds={{ high: 0.35, medium: 0.2 }} // CLIP-scale similarity
 *   onSelect={(id, on) => toggle(id, on)}
 *   onDelete={(id) => remove(id)}
 * />
 * ```
 */
export function ImageResultGallery({
  cards,
  layout = 'grid',
  selectedIds = [],
  scoreThresholds,
  onSelect,
  onDelete,
  className,
}: ImageResultGalleryProps) {
  const selectedSet = new Set(selectedIds);
  const thresholds: ResolvedScoreThresholds = {
    high: scoreThresholds?.high ?? 0.8,
    medium: scoreThresholds?.medium ?? 0.5,
  };

  if (cards.length === 0) return null;

  return (
    <div className={cn('@container', className)}>
      <style>{FADE_IN_KEYFRAMES}</style>
      <div
        className={
          layout === 'grid'
            ? 'grid grid-cols-2 gap-3 @md:grid-cols-3 @xl:grid-cols-4'
            : 'flex flex-col gap-2'
        }
      >
        {cards.map((card, index) => (
          <ResultCard
            key={card.id}
            card={card}
            index={index}
            layout={layout}
            selected={selectedSet.has(card.id)}
            thresholds={thresholds}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
