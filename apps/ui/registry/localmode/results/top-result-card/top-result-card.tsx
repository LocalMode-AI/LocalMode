'use client';

import { cn } from '@/lib/utils';
import {
  ConfidenceScoreBadge,
  resolveTier,
  type ConfidenceThresholds,
} from '@/registry/localmode/results/confidence-score-badge/confidence-score-badge';

/** Props for {@link TopResultCard}. */
export interface TopResultCardProps {
  /** The winning label (sentiment, intent, language, gesture, …). */
  label: string;
  /** The winning confidence score in the inclusive range 0–1. */
  score: number;
  /**
   * Short heading above the result (e.g. "Predicted sentiment").
   * @default "Top result"
   */
  title?: string;
  /** Optional descriptive text shown beneath the result. */
  description?: React.ReactNode;
  /**
   * Tier breakpoints, forwarded to the embedded confidence badge and used to
   * tint the glow.
   * @default { high: 0.8, medium: 0.5 }
   */
  thresholds?: ConfidenceThresholds;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/** Glow tint per tier, wired to CSS variables so it themes via consumer tokens. */
const GLOW: Record<'high' | 'medium' | 'low', string> = {
  high: 'var(--color-emerald-500, #10b981)',
  medium: 'var(--color-amber-500, #f59e0b)',
  low: 'var(--color-muted-foreground, #6b7280)',
};

/**
 * A hero card highlighting the single winning classification result — a large
 * label, a prominent confidence number, and a tier-tinted gradient-border glow.
 * Designed to pair above a `ScoredResultBarList`, and serves any single-winner
 * output (sentiment, intent, language detection, gesture, zero-shot).
 *
 * @example
 * ```tsx
 * const [top] = results ?? [];
 * {top && <TopResultCard label={top.label} score={top.score} title="Sentiment" />}
 * ```
 */
export function TopResultCard({
  label,
  score,
  title = 'Top result',
  description,
  thresholds,
  className,
}: TopResultCardProps) {
  const tier = resolveTier(
    Math.min(1, Math.max(0, score)),
    thresholds,
  );
  const glow = GLOW[tier];

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm',
        className,
      )}
      style={{ boxShadow: `0 0 0 1px ${glow}33, 0 8px 32px -8px ${glow}55` }}
    >
      {/* Soft radial glow behind the content. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-8 size-40 rounded-full opacity-20 blur-2xl"
        style={{ backgroundColor: glow }}
      />
      <div className="relative flex flex-col gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        <div className="flex items-end justify-between gap-4">
          <span className="min-w-0 break-words text-2xl font-bold leading-none text-foreground [overflow-wrap:anywhere]">
            {label}
          </span>
          <div className="flex min-h-16 min-w-16 shrink-0 items-center justify-center">
            <ConfidenceScoreBadge
              score={score}
              variant="radial"
              thresholds={thresholds}
              size={64}
            />
          </div>
        </div>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}
