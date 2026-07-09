'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * A detected data format. The built-in color map covers the four formats that
 * `@localmode/react`'s `useImportExport()` (and core `parseExternalFormat()`)
 * auto-detect, but any string is accepted — unknown formats fall back to a
 * neutral style.
 */
export type DetectedFormat =
  | 'pinecone'
  | 'chroma'
  | 'csv'
  | 'jsonl'
  | (string & {});

/**
 * A pair of Tailwind utility class strings describing a format's look: a soft
 * tinted `badge` background and an optional `dot` color for the leading marker.
 */
export interface FormatStyle {
  /** Classes applied to the badge container (background, text, border). */
  badge: string;
  /** Classes applied to the leading status dot. */
  dot: string;
}

/**
 * Default per-format color map. Keys are compared case-insensitively against
 * the `format` prop. Override or extend via the `colorMap` prop without editing
 * the component.
 */
export const DEFAULT_FORMAT_COLORS: Record<string, FormatStyle> = {
  pinecone: {
    badge:
      'bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300',
    dot: 'bg-sky-500',
  },
  chroma: {
    badge:
      'bg-violet-500/10 text-violet-700 border-violet-500/30 dark:text-violet-300',
    dot: 'bg-violet-500',
  },
  csv: {
    badge:
      'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  jsonl: {
    badge:
      'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
};

/** Neutral style used when a format has no entry in the color map. */
const UNKNOWN_FORMAT_STYLE: FormatStyle = {
  badge: 'bg-muted text-muted-foreground border-border',
  dot: 'bg-muted-foreground',
};

/** Props for {@link FormatDetectionBadge}. */
export interface FormatDetectionBadgeProps {
  /**
   * The detected data format (e.g. `"pinecone"`, `"chroma"`, `"csv"`,
   * `"jsonl"`). The value is matched case-insensitively against the color map;
   * the label is rendered upper-cased. When `null`/`undefined`, a neutral
   * "detecting…" state renders instead.
   */
  format?: DetectedFormat | null;
  /**
   * Per-format color map. Merged over {@link DEFAULT_FORMAT_COLORS}, so you can
   * override a single format or add new ones. Keys are lower-cased before
   * lookup.
   */
  colorMap?: Record<string, FormatStyle>;
  /**
   * Hide the leading status dot.
   * @default false
   */
  hideDot?: boolean;
  /**
   * Text shown while no format has been detected yet (`format` is nullish).
   * @default "detecting…"
   */
  pendingLabel?: string;
  /** Additional class names merged onto the badge. */
  className?: string;
}

/**
 * A small badge that displays an auto-detected data format with a per-format
 * color. Pair it with `useImportExport()` — render
 * `parseResult.format` after parsing a Pinecone/Chroma/CSV/JSONL export to
 * confirm the source format before importing.
 *
 * Fully self-contained and presentational: pass a `format` string and an
 * optional `colorMap`. Styled with shadcn/ui CSS variables (neutral fallback)
 * plus Tailwind palette tints, so it inherits the consumer's theme.
 *
 * @example
 * ```tsx
 * const { parseResult } = useImportExport({ db });
 * <FormatDetectionBadge format={parseResult?.format} />
 * ```
 *
 * @example Custom format + color
 * ```tsx
 * <FormatDetectionBadge
 *   format="parquet"
 *   colorMap={{ parquet: { badge: 'bg-rose-500/10 text-rose-700 border-rose-500/30', dot: 'bg-rose-500' } }}
 * />
 * ```
 */
export function FormatDetectionBadge({
  format,
  colorMap,
  hideDot = false,
  pendingLabel = 'detecting…',
  className,
}: FormatDetectionBadgeProps) {
  const colors = colorMap
    ? { ...DEFAULT_FORMAT_COLORS, ...colorMap }
    : DEFAULT_FORMAT_COLORS;

  const key = typeof format === 'string' ? format.trim().toLowerCase() : '';
  const detected = key.length > 0;
  const style = detected
    ? (colors[key] ?? UNKNOWN_FORMAT_STYLE)
    : UNKNOWN_FORMAT_STYLE;

  return (
    <span
      role="status"
      data-format={detected ? key : undefined}
      className={cn(
        'inline-flex max-w-full min-w-0 shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide',
        style.badge,
        className,
      )}
    >
      {!hideDot && (
        <span
          aria-hidden="true"
          className={cn(
            'inline-block size-1.5 rounded-full',
            style.dot,
            !detected && 'animate-pulse',
          )}
        />
      )}
      <span className={cn('min-w-0 truncate', detected && 'font-mono uppercase')}>
        {detected ? key : pendingLabel}
      </span>
    </span>
  );
}
