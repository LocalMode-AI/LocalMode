'use client';

import { useState } from 'react';

import {
  ModelRecommendationCard,
  type ModelRecommendation,
} from './model-recommendation-card';

const REC: ModelRecommendation = {
  modelId: 'Xenova/bge-small-en-v1.5',
  name: 'BGE Small EN v1.5',
  provider: 'transformers',
  size: '34 MB',
  score: 88,
  recommendedDevice: 'webgpu',
  speedTier: 'fast',
  qualityTier: 'high',
  description: 'Strong general-purpose embedding model, tiny download.',
  reasons: ['Fits device memory', 'WebGPU accelerated', 'High MTEB score'],
};

/**
 * Demo for ModelRecommendationCard. Shows the radial score dial, tier/device
 * badges, reason chips, and a working compare toggle.
 */
export default function ModelRecommendationCardDemo() {
  const [comparing, setComparing] = useState(false);
  return (
    <ModelRecommendationCard
      recommendation={REC}
      comparing={comparing}
      onToggleCompare={() => setComparing((c) => !c)}
    />
  );
}
