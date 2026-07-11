'use client';

import * as React from 'react';
import { cn } from '@/registry/localmode/lib/utils';

/**
 * A repeating checkerboard background that reveals image transparency (alpha),
 * used behind segmentation / background-removal results. Shipped inline so the
 * component is standalone after `shadcn add` — no global CSS required.
 */
const CHECKERBOARD_STYLE: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, hsl(0 0% 80% / 0.6) 25%, transparent 25%), linear-gradient(-45deg, hsl(0 0% 80% / 0.6) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, hsl(0 0% 80% / 0.6) 75%), linear-gradient(-45deg, transparent 75%, hsl(0 0% 80% / 0.6) 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
};

/** Props for {@link BeforeAfterImageViewer}. */
export interface BeforeAfterImageViewerProps {
  /** Source (data URL or URL) of the original image. */
  originalSrc: string;
  /**
   * Source of the transformed result (upscaled, segmented, background-removed).
   * When omitted, only the original is shown.
   */
  processedSrc?: string;
  /**
   * Layout. `"grid"` shows both panels side-by-side; `"toggle"` shows one image
   * with a segmented Original/Enhanced switch.
   * @default "grid"
   */
  mode?: 'grid' | 'toggle';
  /** Label for the original panel/toggle. @default "Original" */
  originalLabel?: string;
  /** Label for the result panel/toggle. @default "Enhanced" */
  processedLabel?: string;
  /**
   * Render the result panel on a checkerboard transparency background so alpha
   * shows through (segmentation / background removal). @default true
   */
  checkerboard?: boolean;
  /**
   * Base alt text for the subject. Distinct alts are derived for the two images
   * so assistive tech never hears the same description for both — the original
   * becomes `"{originalLabel}: {alt}"` and the result `"{processedLabel}:
   * {alt}"`. Empty (the default) keeps both images decorative. Use
   * {@link originalAlt} / {@link resultAlt} to set them explicitly.
   * @default ""
   */
  alt?: string;
  /**
   * Explicit alt for the original image. Overrides the value derived from
   * {@link alt}.
   */
  originalAlt?: string;
  /**
   * Explicit alt for the processed/result image. Overrides the value derived
   * from {@link alt}.
   */
  resultAlt?: string;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/** A single labeled image panel; optionally on the checkerboard + ring-highlighted. */
function Panel({
  src,
  label,
  active,
  checkerboard,
  alt,
}: {
  src: string;
  label: string;
  active: boolean;
  checkerboard: boolean;
  alt: string;
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border border-border bg-card transition-shadow',
        active && 'ring-1 ring-primary',
      )}
    >
      <div
        className="flex items-center justify-center"
        style={checkerboard ? CHECKERBOARD_STYLE : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="max-h-80 w-full object-contain" />
      </div>
      <span className="absolute left-2 top-2 rounded-full bg-background/80 px-2 py-0.5 text-xs font-medium text-foreground backdrop-blur-sm">
        {label}
      </span>
    </div>
  );
}

/**
 * Compares an original image with a transformed result. Two modes:
 *
 * - `grid` — both panels side-by-side; the result panel sits on a checkerboard
 *   so transparency (segmentation, background removal) shows through.
 * - `toggle` — a single image with a segmented Original/Enhanced switch that
 *   swaps the source.
 *
 * Presentational: pass `originalSrc` + `processedSrc` produced by a vision hook
 * (`useImageToImage` / `useSegmentImage`). Owns only the toggle's local UI state.
 *
 * @example
 * ```tsx
 * <BeforeAfterImageViewer
 *   originalSrc={inputDataUrl}
 *   processedSrc={result.image}
 *   mode="toggle"
 * />
 * ```
 */
export function BeforeAfterImageViewer({
  originalSrc,
  processedSrc,
  mode = 'grid',
  originalLabel = 'Original',
  processedLabel = 'Enhanced',
  checkerboard = true,
  alt = '',
  originalAlt,
  resultAlt,
  className,
}: BeforeAfterImageViewerProps) {
  const [showProcessed, setShowProcessed] = React.useState(true);
  const hasProcessed = Boolean(processedSrc);
  const panelId = React.useId();

  // Derive distinct alts so the original and result are never announced
  // identically. Empty `alt` stays empty (both decorative).
  const resolvedOriginalAlt = originalAlt ?? (alt ? `${originalLabel}: ${alt}` : alt);
  const resolvedResultAlt = resultAlt ?? (alt ? `${processedLabel}: ${alt}` : alt);

  if (mode === 'toggle') {
    const showingResult = hasProcessed && showProcessed;
    const activeSrc = showingResult ? processedSrc! : originalSrc;

    // Two mutually exclusive views of one region: an ARIA tablist, not a pair of
    // aria-pressed toggle buttons. Assistive tech announces "selected, 1 of 2"
    // and the arrow keys move between views, which `aria-pressed` cannot express.
    const tabProps = (selected: boolean, onSelect: () => void) => ({
      type: 'button' as const,
      role: 'tab',
      'aria-selected': selected,
      'aria-controls': panelId,
      tabIndex: selected ? 0 : -1,
      onClick: onSelect,
      onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        setShowProcessed((current) => !current);
      },
      className: cn(
        'rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        selected
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      ),
    });

    return (
      <div className={cn('space-y-3', className)}>
        <div
          id={panelId}
          role={hasProcessed ? 'tabpanel' : undefined}
          aria-label={hasProcessed ? (showingResult ? processedLabel : originalLabel) : undefined}
          className="relative flex items-center justify-center overflow-hidden rounded-lg border border-border bg-card"
          style={showingResult && checkerboard ? CHECKERBOARD_STYLE : undefined}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activeSrc}
            alt={showingResult ? resolvedResultAlt : resolvedOriginalAlt}
            className="max-h-96 w-full object-contain"
          />
        </div>

        {hasProcessed && (
          <div
            role="tablist"
            aria-label="Compare original and result"
            className="inline-flex rounded-lg border border-border bg-muted p-1"
          >
            <button {...tabProps(!showProcessed, () => setShowProcessed(false))}>
              {originalLabel}
            </button>
            <button {...tabProps(showProcessed, () => setShowProcessed(true))}>
              {processedLabel}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('@container', className)}>
      <div className="grid gap-4 @md:grid-cols-2">
        <Panel
          src={originalSrc}
          label={originalLabel}
          active={false}
          checkerboard={false}
          alt={resolvedOriginalAlt}
        />
        {hasProcessed && (
          <Panel
            src={processedSrc!}
            label={processedLabel}
            active
            checkerboard={checkerboard}
            alt={resolvedResultAlt}
          />
        )}
      </div>
    </div>
  );
}
