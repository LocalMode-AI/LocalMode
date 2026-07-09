'use client';

import { TopResultCard } from './top-result-card';

/**
 * Demo for the TopResultCard component, used by the docs live preview.
 * Shows a winning sentiment result with its glow treatment. Fully local.
 */
export default function TopResultCardDemo() {
  return (
    <div className="max-w-sm">
      <TopResultCard
        title="Predicted sentiment"
        label="Positive"
        score={0.93}
        description="The reviewer is overwhelmingly satisfied with the product."
      />
    </div>
  );
}
