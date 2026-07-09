'use client';

import { Cloud, Cpu, Download } from 'lucide-react';
import { useCapabilities } from '@/lib/use-environment';

import { cn } from '@/registry/localmode/lib/utils';

/** Provider tier surfaced by the badge. */
export type ProviderTier = 'built-in' | 'download';

/** Props for {@link ProviderFallbackBadge}. */
export interface ProviderFallbackBadgeProps {
  /**
   * Active provider tier: a zero-download built-in (e.g. Chrome AI) vs a
   * model-download provider (e.g. Transformers.js).
   */
  tier: ProviderTier;
  /** Provider display name (e.g. "Chrome AI", "Transformers.js"). */
  providerName?: string;
  /**
   * Override the cross-origin-isolation flag. When omitted the badge reads
   * `useCapabilities` (and falls back to `globalThis.crossOriginIsolated`).
   */
  crossOriginIsolated?: boolean;
  /** Hide the threading sub-badge. @default false */
  hideThreading?: boolean;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * Surfaces the active AI backend tier — a zero-download built-in (Chrome AI)
 * vs a model-download provider (Transformers.js) — plus a WASM threading variant
 * ("Multi-thread" when cross-origin isolated / SharedArrayBuffer is available,
 * else "Single-thread"). A software-side sibling to `DeviceBadge`.
 *
 * @example
 * ```tsx
 * <ProviderFallbackBadge tier="download" providerName="Transformers.js" />
 * ```
 */
export function ProviderFallbackBadge({
  tier,
  providerName,
  crossOriginIsolated,
  hideThreading = false,
  className,
}: ProviderFallbackBadgeProps) {
  const { capabilities } = useCapabilities();

  const coi =
    crossOriginIsolated ??
    (capabilities
      ? capabilities.features.crossOriginisolated
      : typeof globalThis !== 'undefined'
        ? Boolean((globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated)
        : false);

  const isBuiltIn = tier === 'built-in';
  const name = providerName ?? (isBuiltIn ? 'Built-in AI' : 'Download provider');

  return (
    <div className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
          isBuiltIn
            ? 'border-primary/40 bg-primary/5 text-primary'
            : 'border-border bg-card text-card-foreground',
        )}
      >
        {isBuiltIn ? (
          <Cloud className="size-3.5" aria-hidden="true" />
        ) : (
          <Download className="size-3.5" aria-hidden="true" />
        )}
        {name}
      </span>
      {!hideThreading && (
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
          <Cpu className="size-3.5" aria-hidden="true" />
          {coi ? 'Multi-thread' : 'Single-thread'}
        </span>
      )}
    </div>
  );
}
