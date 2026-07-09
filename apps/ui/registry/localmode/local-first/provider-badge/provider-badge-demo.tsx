'use client';

import { useState } from 'react';

import { ProviderBadge } from './provider-badge';

/**
 * Demo for ProviderBadge, used by the docs live preview. Toggle the "Resolving"
 * state to see the placeholder flip to a resolved built-in provider; a second
 * badge shows a download-tier provider with a served model id and a note.
 */
export default function ProviderBadgeDemo() {
  const [resolved, setResolved] = useState(true);

  return (
    <div className="flex flex-col items-start gap-3">
      <ProviderBadge
        providerName={resolved ? 'Chrome AI' : null}
        tier="built-in"
        modelId={resolved ? 'gemini-nano' : null}
      />
      <ProviderBadge
        providerName="Transformers.js"
        tier="download"
        modelId="Xenova/distilbart-cnn-6-6"
        note="Runs on-device"
      />
      <button
        type="button"
        onClick={() => setResolved((r) => !r)}
        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
      >
        {resolved ? 'Show resolving state' : 'Resolve provider'}
      </button>
    </div>
  );
}
