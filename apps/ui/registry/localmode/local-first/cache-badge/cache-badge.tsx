'use client';

import { Zap } from 'lucide-react';

import { cn } from '@/registry/localmode/lib/utils';

/** Props for {@link CacheBadge}. */
export interface CacheBadgeProps {
  /**
   * Whether the annotated result was served from the semantic cache.
   * When false, nothing renders.
   */
  cached: boolean;
  /** Optional cache-hit latency in milliseconds (e.g. 12 → "cached · 12ms"). */
  latencyMs?: number;
  /** Label override for the cached state. @default "cached" */
  label?: string;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * Annotates a result as served from the semantic cache, optionally with the
 * hit latency (e.g. "cached · 12ms"). Local apps cache responses on-device;
 * surfacing a cache hit makes that invisible speedup legible. Drive `cached`/
 * `latencyMs` from your `useSemanticCache` lookup result. Renders nothing when
 * `cached` is false, so it is safe to drop next to any result.
 *
 * @example
 * ```tsx
 * <CacheBadge cached={hit.cached} latencyMs={hit.latencyMs} />
 * ```
 */
export function CacheBadge({
  cached,
  latencyMs,
  label = 'cached',
  className,
}: CacheBadgeProps) {
  if (!cached) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/5 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400',
        className,
      )}
    >
      <Zap className="size-3" aria-hidden="true" />
      {label}
      {typeof latencyMs === 'number' && (
        <span className="text-emerald-600/70 dark:text-emerald-400/70">
          · {Math.round(latencyMs)}ms
        </span>
      )}
    </span>
  );
}
