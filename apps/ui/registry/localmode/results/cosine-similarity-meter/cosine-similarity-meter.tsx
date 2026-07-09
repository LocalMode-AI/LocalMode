'use client';

import { cn } from '@/lib/utils';

/** A similarity bucket: a lower bound, a label, and a color token. */
export interface SimilarityBucket {
  /** Inclusive lower bound for this bucket (0–1). */
  min: number;
  /** Human-readable label (e.g. "Very similar"). */
  label: string;
  /** Color token for the value + arc (any valid CSS color). */
  color: string;
}

/** Props for {@link CosineSimilarityMeter}. */
export interface CosineSimilarityMeterProps {
  /**
   * Cosine similarity in the inclusive range 0–1 (the raw cosine of two
   * embeddings, typically derived from `useEmbed` / `useEmbedImage`).
   */
  similarity: number;
  /**
   * Ordered, descending-by-`min` bucket definitions. The first bucket whose
   * `min` the similarity meets or exceeds wins.
   * @default the built-in 5-bucket scale
   */
  buckets?: SimilarityBucket[];
  /**
   * Optional caption shown beneath the bucket label.
   */
  caption?: React.ReactNode;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * Default 5-bucket cosine scale. Colors are wired to CSS variables so the meter
 * themes via the consumer's tokens. Sorted descending by `min`.
 */
const DEFAULT_BUCKETS: SimilarityBucket[] = [
  { min: 0.85, label: 'Very similar', color: 'var(--color-emerald-500, #10b981)' },
  { min: 0.7, label: 'Similar', color: 'var(--color-teal-500, #14b8a6)' },
  { min: 0.5, label: 'Somewhat similar', color: 'var(--color-amber-500, #f59e0b)' },
  { min: 0.3, label: 'Loosely related', color: 'var(--color-orange-500, #f97316)' },
  { min: 0, label: 'Unrelated', color: 'var(--color-muted-foreground, #6b7280)' },
];

/** Resolve a similarity to its bucket. Exported for reuse. */
export function resolveBucket(
  similarity: number,
  buckets: SimilarityBucket[] = DEFAULT_BUCKETS,
): SimilarityBucket {
  const ordered = [...buckets].sort((a, b) => b.min - a.min);
  return (
    ordered.find((bucket) => similarity >= bucket.min) ??
    ordered[ordered.length - 1]
  );
}

/**
 * A display card showing a cosine similarity score (0–1) as a large numeric
 * value with a human-readable bucket label (e.g. "Very similar", "Unrelated")
 * using configurable thresholds, plus a proportional arc gauge.
 *
 * @example
 * ```tsx
 * <CosineSimilarityMeter similarity={0.88} />            // "Very similar"
 * <CosineSimilarityMeter similarity={0.41} caption="query ↔ document" />
 * ```
 */
export function CosineSimilarityMeter({
  similarity,
  buckets = DEFAULT_BUCKETS,
  caption,
  className,
}: CosineSimilarityMeterProps) {
  const value = Math.min(1, Math.max(0, Number.isFinite(similarity) ? similarity : 0));
  const bucket = resolveBucket(value, buckets);

  // Half-ring gauge geometry.
  const radius = 52;
  const circumference = Math.PI * radius; // semicircle length
  const dash = value * circumference;

  return (
    <div
      role="meter"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={1}
      aria-label={`Cosine similarity ${value.toFixed(2)}: ${bucket.label}`}
      className={cn(
        'inline-flex flex-col items-center gap-1 rounded-xl border border-border bg-card px-6 py-5 text-card-foreground shadow-sm',
        className,
      )}
    >
      <svg width={132} height={78} viewBox="0 0 132 78" aria-hidden="true">
        <path
          d="M 14 66 A 52 52 0 0 1 118 66"
          fill="none"
          stroke="var(--color-border, #e5e7eb)"
          strokeWidth={12}
          strokeLinecap="round"
        />
        <path
          d="M 14 66 A 52 52 0 0 1 118 66"
          fill="none"
          stroke={bucket.color}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          className="transition-[stroke-dasharray] duration-500 ease-out"
        />
        <text
          x={66}
          y={60}
          textAnchor="middle"
          className="fill-foreground text-2xl font-bold tabular-nums"
        >
          {value.toFixed(2)}
        </text>
      </svg>
      <span className="text-sm font-semibold text-foreground">
        {bucket.label}
      </span>
      {caption && (
        <span className="text-xs text-muted-foreground">{caption}</span>
      )}
    </div>
  );
}
