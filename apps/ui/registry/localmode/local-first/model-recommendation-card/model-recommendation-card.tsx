'use client';

import { Check, GitCompare } from 'lucide-react';

import { cn } from '@/registry/localmode/lib/utils';

/** Recommended runtime device. */
export type RecommendedDevice = 'webgpu' | 'wasm' | 'cpu';
/** Speed tier. */
export type SpeedTier = 'fast' | 'medium' | 'slow';
/** Quality tier. */
export type QualityTier = 'low' | 'medium' | 'high';

/** A scored model recommendation (mirrors `useModelRecommendations` output). */
export interface ModelRecommendation {
  /** Stable model id. */
  modelId: string;
  /** Display name. */
  name: string;
  /** Provider (e.g. "transformers", "wllama"). */
  provider?: string;
  /** Human-readable size. */
  size?: string;
  /** Score in the 0–100 range. */
  score: number;
  /** Recommended runtime device. */
  recommendedDevice?: RecommendedDevice;
  /** Speed tier. */
  speedTier?: SpeedTier;
  /** Quality tier. */
  qualityTier?: QualityTier;
  /** One-line description. */
  description?: string;
  /** Reasons the model was recommended. */
  reasons?: string[];
}

/** Props for {@link ModelRecommendationCard}. */
export interface ModelRecommendationCardProps {
  /** The recommendation to render. */
  recommendation: ModelRecommendation;
  /** Whether this card is selected for comparison. */
  comparing?: boolean;
  /** When provided, shows a compare toggle that calls back with the model id. */
  onToggleCompare?: (modelId: string) => void;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/** Stable tier → text-color mapping. */
const TIER_COLOR: Record<string, string> = {
  fast: 'text-emerald-700 dark:text-emerald-400',
  high: 'text-emerald-700 dark:text-emerald-400',
  medium: 'text-amber-700 dark:text-amber-400',
  slow: 'text-rose-700 dark:text-rose-400',
  low: 'text-rose-700 dark:text-rose-400',
  webgpu: 'text-violet-700 dark:text-violet-400',
  wasm: 'text-sky-700 dark:text-sky-400',
  cpu: 'text-muted-foreground',
};

function scoreColor(score: number): string {
  if (score >= 75) return 'var(--color-emerald-500, #10b981)';
  if (score >= 50) return 'var(--color-amber-500, #f59e0b)';
  return 'var(--color-rose-500, #f43f5e)';
}

/**
 * A single scored model recommendation: a radial score dial (0–100), the model
 * name, a monospace model id, a badge row (provider, size, speed/quality tiers,
 * recommended device with a stable tier→color mapping), a description, and
 * reason chips. When `onToggleCompare` is supplied, exposes a compare toggle.
 * Bind to `useModelRecommendations`.
 *
 * @example
 * ```tsx
 * <ModelRecommendationCard recommendation={rec} onToggleCompare={toggle} />
 * ```
 */
export function ModelRecommendationCard({
  recommendation: r,
  comparing = false,
  onToggleCompare,
  className,
}: ModelRecommendationCardProps) {
  const score = Math.max(0, Math.min(100, Math.round(r.score)));

  const badges = [
    r.provider,
    r.size,
    r.speedTier && `${r.speedTier} speed`,
    r.qualityTier && `${r.qualityTier} quality`,
    r.recommendedDevice,
  ]
    .map((label, i) => ({
      label,
      tone:
        i === 2
          ? TIER_COLOR[r.speedTier ?? '']
          : i === 3
            ? TIER_COLOR[r.qualityTier ?? '']
            : i === 4
              ? TIER_COLOR[r.recommendedDevice ?? '']
              : undefined,
    }))
    .filter((b) => Boolean(b.label));

  return (
    <div
      className={cn(
        'flex w-full max-w-md flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-sm transition-colors',
        comparing ? 'border-primary ring-1 ring-primary' : 'border-border',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className="relative flex size-12 shrink-0 items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(${scoreColor(score)} ${score}%, var(--muted) 0)`,
          }}
          aria-label={`Score ${score} of 100`}
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-card text-sm font-semibold tabular-nums">
            {score}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{r.name}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {r.modelId}
          </p>
        </div>
        {onToggleCompare && (
          <button
            type="button"
            aria-pressed={comparing}
            onClick={() => onToggleCompare(r.modelId)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors',
              comparing
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background hover:bg-accent',
            )}
          >
            {comparing ? (
              <Check className="size-3" aria-hidden="true" />
            ) : (
              <GitCompare className="size-3" aria-hidden="true" />
            )}
            Compare
          </button>
        )}
      </div>

      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {badges.map((b, i) => (
            <span
              key={i}
              className={cn(
                'inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium',
                b.tone ?? 'text-muted-foreground',
              )}
            >
              {b.label}
            </span>
          ))}
        </div>
      )}

      {r.description && (
        <p className="text-xs text-muted-foreground">{r.description}</p>
      )}

      {r.reasons && r.reasons.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {r.reasons.map((reason, i) => (
            <li
              key={i}
              className="inline-flex min-w-0 items-center whitespace-normal [overflow-wrap:anywhere] rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-300"
            >
              {reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
