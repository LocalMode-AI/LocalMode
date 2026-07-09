'use client';

import { ConfidenceScoreBadge } from './confidence-score-badge';

/**
 * Demo for the ConfidenceScoreBadge component, used by the docs live preview.
 * Shows the flat + radial variants across all three tiers, plus a custom
 * threshold. Fully local — no model download.
 */
export default function ConfidenceScoreBadgeDemo() {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <ConfidenceScoreBadge score={0.94} label="positive" />
        <ConfidenceScoreBadge score={0.63} label="neutral" />
        <ConfidenceScoreBadge score={0.28} label="negative" />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-5">
        <ConfidenceScoreBadge score={0.94} variant="radial" />
        <ConfidenceScoreBadge score={0.63} variant="radial" />
        <ConfidenceScoreBadge score={0.28} variant="radial" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {/* Tuned for a tighter cosine distribution. */}
        <ConfidenceScoreBadge
          score={0.72}
          thresholds={{ high: 0.65, medium: 0.4 }}
          label="custom thresholds"
        />
      </div>
    </div>
  );
}
