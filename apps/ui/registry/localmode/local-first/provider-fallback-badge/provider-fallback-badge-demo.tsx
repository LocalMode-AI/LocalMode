'use client';

import { ProviderFallbackBadge } from './provider-fallback-badge';

/**
 * Demo for ProviderFallbackBadge. The threading sub-badge reflects the
 * runtime's real crossOriginIsolated state via useCapabilities.
 */
export default function ProviderFallbackBadgeDemo() {
  return (
    <div className="flex flex-col items-start gap-3">
      <ProviderFallbackBadge tier="built-in" providerName="Chrome AI" />
      <ProviderFallbackBadge tier="download" providerName="Transformers.js" />
    </div>
  );
}
