'use client';

import { ProviderFallbackBadge } from '@/components/provider-fallback-badge';

/** Provider tier — a zero-download built-in vs a model-download provider. */
export type ProviderTier = 'built-in' | 'download';

/** Props for {@link ProviderBadge}. */
export interface ProviderBadgeProps {
  /** Resolved provider display name, or null while resolution is pending. */
  providerName: string | null;
  /** The resolved provider's tier (drives the composed fallback badge). */
  tier: ProviderTier;
  /** The model id that actually served the most recent result, if any. */
  modelId: string | null;
  /** Optional note rendered after the badge (e.g. a provider disclaimer). */
  note?: string;
}

/**
 * Displays the RESOLVED provider identity — composing `ProviderFallbackBadge`
 * for the tier and name — alongside the model id that actually served the
 * request. While `providerName` is null it shows a "Resolving provider…"
 * placeholder, so the badge never claims a provider before one has resolved.
 *
 * Presentational — pass in the resolved provenance (e.g. from a provider
 * fallback resolver). Styled with shadcn/ui CSS variables so it inherits the
 * consumer's theme.
 *
 * @example
 * ```tsx
 * <ProviderBadge providerName="Chrome AI" tier="built-in" modelId="gemini-nano" />
 * ```
 */
export function ProviderBadge({ providerName, tier, modelId, note }: ProviderBadgeProps) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 text-xs">
      {providerName ? (
        <ProviderFallbackBadge tier={tier} providerName={providerName} hideThreading />
      ) : (
        <span className="text-muted-foreground">Resolving provider…</span>
      )}
      {note && <span className="text-muted-foreground">{note}</span>}
      {modelId && (
        <span className="min-w-0 break-all font-mono text-[11px] text-muted-foreground">
          {modelId}
        </span>
      )}
    </div>
  );
}
