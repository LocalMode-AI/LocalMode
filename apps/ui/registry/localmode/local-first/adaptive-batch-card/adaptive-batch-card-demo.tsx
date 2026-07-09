'use client';

import { useAdaptiveBatchSize } from '@localmode/react';

import { AdaptiveBatchBadge, AdaptiveBatchCard } from './adaptive-batch-card';

/**
 * Demo for AdaptiveBatchCard / AdaptiveBatchBadge. Uses the device's real
 * useAdaptiveBatchSize output for an embedding task — the batch number reflects
 * this machine's cores / RAM / GPU.
 */
export default function AdaptiveBatchCardDemo() {
  const result = useAdaptiveBatchSize({ taskType: 'embedding', modelDimensions: 384 });
  return (
    <div className="flex w-full max-w-md flex-col items-start gap-4">
      <AdaptiveBatchBadge result={result} />
      <AdaptiveBatchCard result={result} />
    </div>
  );
}
