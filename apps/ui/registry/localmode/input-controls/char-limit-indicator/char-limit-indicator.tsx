'use client';

import { cn } from '@/lib/utils';

/** Props for {@link CharLimitIndicator}. */
export interface CharLimitIndicatorProps {
  /** Current number of characters in the bound input. */
  charCount: number;
  /** Maximum allowed characters. The ring fills as `charCount` approaches it. */
  maxLength: number;
  /**
   * Diameter of the ring in pixels.
   * @default 28
   */
  size?: number;
  /**
   * Stroke width of the ring in pixels.
   * @default 3
   */
  strokeWidth?: number;
  /**
   * When true, render only the ring (hide the `n/MAX` counter).
   * @default false
   */
  ringOnly?: boolean;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * A compact character-count display: a radial progress ring (percentage of the
 * limit consumed) paired with an `n/MAX` monospace counter. When `charCount`
 * exceeds `maxLength`, the counter and ring switch to the error color and the
 * ring renders the over-limit percentage (clamped to a full circle).
 *
 * The ring is a pure SVG implementation driven by shadcn/ui CSS-variable
 * colors (`text-primary`, `text-destructive`, `text-border`), so it inherits the
 * consumer's theme — no daisyUI, no canvas. Self-contained: it takes only
 * `charCount` and `maxLength` and derives the percentage internally, which lets
 * it drop in beside any length-bounded textarea or `PromptInput`.
 *
 * @example
 * ```tsx
 * <CharLimitIndicator charCount={value.length} maxLength={280} />
 * ```
 */
export function CharLimitIndicator({
  charCount,
  maxLength,
  size = 28,
  strokeWidth = 3,
  ringOnly = false,
  className,
}: CharLimitIndicatorProps) {
  const safeMax = maxLength > 0 ? maxLength : 1;
  const ratio = charCount / safeMax;
  const overLimit = charCount > maxLength;

  // Geometry: the visible arc length is `ratio` of the circumference, clamped to
  // a full circle so the over-limit state shows a complete (error-colored) ring.
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedRatio = Math.min(Math.max(ratio, 0), 1);
  const dashOffset = circumference * (1 - clampedRatio);

  const percent = Math.round(ratio * 100);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${charCount} of ${maxLength} characters used`}
      className={cn(
        'inline-flex items-center gap-2 text-xs',
        className,
      )}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="text-border"
          stroke="currentColor"
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          stroke="currentColor"
          className={cn(
            'transition-[stroke-dashoffset] duration-200',
            overLimit ? 'text-destructive' : 'text-primary',
          )}
        />
      </svg>
      {!ringOnly && (
        <span
          className={cn(
            'font-mono tabular-nums',
            overLimit ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {charCount}
          <span className="opacity-60">/{maxLength}</span>
        </span>
      )}
      <span className="sr-only">{percent}% of limit</span>
    </div>
  );
}
