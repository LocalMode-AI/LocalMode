'use client';

import { useState } from 'react';

import {
  DifferentialPrivacyControls,
  DpAppliedBadge,
} from './differential-privacy-controls';

/**
 * Demo for the DifferentialPrivacyControls component, used by the docs live
 * preview.
 *
 * Holds DP state locally and simulates budget consumption with a "Run query"
 * button so you can watch the budget bar transition ok → warning → error. In a
 * real app this state comes from `dpEmbeddingMiddleware` /
 * `dpClassificationMiddleware` and a `createPrivacyBudget` tracker — the
 * component only renders it.
 */
export default function DifferentialPrivacyControlsDemo() {
  const [enabled, setEnabled] = useState(true);
  const [epsilon, setEpsilon] = useState(1.0);
  const [consumed, setConsumed] = useState(0);

  const maxEpsilon = 10;
  const lastApplied = consumed > 0;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <DifferentialPrivacyControls
        enabled={enabled}
        onEnabledChange={setEnabled}
        epsilon={epsilon}
        onEpsilonChange={setEpsilon}
        budget={{ consumed, maxEpsilon }}
      />

      <button
        type="button"
        disabled={!enabled || consumed >= maxEpsilon}
        onClick={() => setConsumed((c) => Math.min(maxEpsilon, c + epsilon))}
        className="h-9 self-start rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
      >
        Run protected query (consume ε)
      </button>

      {/* "DP Applied" provenance chip — only shown when DP was applied */}
      {enabled && lastApplied && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-card p-3 text-sm">
          <span className="text-muted-foreground">Protected result</span>
          <DpAppliedBadge epsilon={epsilon} dimensions={384} />
        </div>
      )}
    </div>
  );
}
