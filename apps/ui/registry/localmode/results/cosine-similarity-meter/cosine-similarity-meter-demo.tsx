'use client';

import { CosineSimilarityMeter } from './cosine-similarity-meter';

/**
 * Demo for the CosineSimilarityMeter component, used by the docs live preview.
 * Shows several similarities mapping to their bucket labels. Fully local.
 */
export default function CosineSimilarityMeterDemo() {
  return (
    <div className="flex flex-wrap items-start gap-4">
      <CosineSimilarityMeter similarity={0.91} caption="near-duplicate" />
      <CosineSimilarityMeter similarity={0.58} caption="related topics" />
      <CosineSimilarityMeter similarity={0.18} caption="different topics" />
    </div>
  );
}
