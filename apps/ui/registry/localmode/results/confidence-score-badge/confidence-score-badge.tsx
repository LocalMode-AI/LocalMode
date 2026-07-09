'use client';

import { cn } from '@/lib/utils';

/** A confidence tier: how a 0–1 score is bucketed for color + label. */
export type ConfidenceTier = 'high' | 'medium' | 'low';

/** Lower-bound thresholds (inclusive) for the `high` and `medium` tiers. */
export interface ConfidenceThresholds {
  /**
   * Scores at or above this map to the `high` tier.
   * @default 0.8
   */
  high?: number;
  /**
   * Scores at or above this (but below `high`) map to the `medium` tier.
   * Everything below it is `low`.
   * @default 0.5
   */
  medium?: number;
}

/** Props for {@link ConfidenceScoreBadge}. */
export interface ConfidenceScoreBadgeProps {
  /** Confidence/similarity score in the inclusive range 0–1. */
  score: number;
  /**
   * Render style. `flat` is a pill badge; `radial` is a circular dial that
   * fills proportionally to the score.
   * @default "flat"
   */
  variant?: 'flat' | 'radial';
  /**
   * Tier breakpoints. Tune these for distributions that differ from the
   * default (e.g. dot-product vs cosine similarity).
   * @default { high: 0.8, medium: 0.5 }
   */
  thresholds?: ConfidenceThresholds;
  /**
   * Optional label rendered before the percentage in the flat variant
   * (e.g. the predicted class name).
   */
  label?: string;
  /**
   * Diameter of the radial dial in pixels. Ignored by the flat variant.
   * @default 56
   */
  size?: number;
  /**
   * Number of fraction digits in the rendered percentage.
   * @default 0
   */
  precision?: number;
  /** Additional class names merged onto the root element. */
  className?: string;
}

const DEFAULT_THRESHOLDS = { high: 0.8, medium: 0.5 } as const;

/**
 * Resolve a 0–1 score to a confidence tier using the supplied (or default)
 * thresholds. Exported so consumers can reuse the exact tiering logic for
 * their own styling.
 */
export function resolveTier(
  score: number,
  thresholds: ConfidenceThresholds = DEFAULT_THRESHOLDS,
): ConfidenceTier {
  const high = thresholds.high ?? DEFAULT_THRESHOLDS.high;
  const medium = thresholds.medium ?? DEFAULT_THRESHOLDS.medium;
  if (score >= high) return 'high';
  if (score >= medium) return 'medium';
  return 'low';
}

/**
 * Per-tier color tokens. The ring/dot color is wired to a CSS variable so the
 * radial dial themes via the consumer's tokens (no daisyUI). `text`/`bg`/`ring`
 * use Tailwind palettes for the flat variant; swap them in the copied file to
 * match your design system.
 */
const TIER_STYLES: Record<
  ConfidenceTier,
  { color: string; flat: string; label: string }
> = {
  high: {
    color: 'var(--color-emerald-500, #10b981)',
    flat: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    label: 'High',
  },
  medium: {
    color: 'var(--color-amber-500, #f59e0b)',
    flat: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
    label: 'Medium',
  },
  low: {
    color: 'var(--color-muted-foreground, #6b7280)',
    flat: 'border-border bg-muted text-muted-foreground',
    label: 'Low',
  },
};

/** Format a 0–1 score as a percentage string. */
function formatPercent(score: number, precision: number) {
  const clamped = Math.min(1, Math.max(0, score));
  return `${(clamped * 100).toFixed(precision)}%`;
}

/**
 * Maps a 0–1 confidence/similarity score to a semantic color tier (configurable
 * thresholds; default high ≥ 0.8 → success, medium ≥ 0.5 → warning, low →
 * muted) and renders it as a formatted percentage — either a flat pill badge or
 * a radial dial.
 *
 * This is the shared scored-output atom across LocalMode Elements: it serves any
 * scalar score from `useClassify` / `useClassifyZeroShot` / `useSemanticSearch`
 * / `useAnswerQuestion` and is consumed cross-family (e.g. by media-vision's
 * `ImageResultGallery`). Styled with CSS-variable tokens so it inherits the
 * consumer's theme.
 *
 * @example
 * ```tsx
 * <ConfidenceScoreBadge score={0.92} />              // 92% — high tier
 * <ConfidenceScoreBadge score={0.41} variant="radial" />
 * <ConfidenceScoreBadge score={0.7} thresholds={{ high: 0.6, medium: 0.3 }} />
 * ```
 */
export function ConfidenceScoreBadge({
  score,
  variant = 'flat',
  thresholds = DEFAULT_THRESHOLDS,
  label,
  size = 56,
  precision = 0,
  className,
}: ConfidenceScoreBadgeProps) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(score) ? score : 0));
  const tier = resolveTier(clamped, thresholds);
  const styles = TIER_STYLES[tier];
  const percent = formatPercent(clamped, precision);

  if (variant === 'radial') {
    // Conic-gradient ring driven by CSS variables → themes via consumer tokens.
    const stroke = Math.max(3, Math.round(size * 0.1));
    const ringStyle = {
      width: size,
      height: size,
      background: `conic-gradient(${styles.color} ${clamped * 360}deg, var(--color-muted, #e5e7eb) 0deg)`,
    } as React.CSSProperties;

    return (
      <div
        role="meter"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-label={`${label ? `${label}: ` : ''}${percent} confidence (${styles.label.toLowerCase()})`}
        className={cn('relative inline-grid place-items-center rounded-full', className)}
        style={ringStyle}
      >
        <div
          className="absolute inset-0 grid place-items-center rounded-full bg-card text-card-foreground"
          style={{ margin: stroke }}
        >
          <span
            className="text-sm font-semibold tabular-nums"
            style={{ color: styles.color }}
          >
            {percent}
          </span>
        </div>
      </div>
    );
  }

  return (
    <span
      role="meter"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={1}
      aria-label={`${label ? `${label}: ` : ''}${percent} confidence (${styles.label.toLowerCase()})`}
      className={cn(
        'inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        styles.flat,
        className,
      )}
    >
      <span
        className="inline-block size-2 shrink-0 rounded-full"
        style={{ backgroundColor: styles.color }}
        aria-hidden="true"
      />
      {label && <span className="min-w-0 truncate text-foreground/80">{label}</span>}
      <span className="shrink-0 tabular-nums">{percent}</span>
    </span>
  );
}
