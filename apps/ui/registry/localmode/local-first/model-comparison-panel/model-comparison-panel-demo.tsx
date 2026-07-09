'use client';

import { useState } from 'react';

import {
  ModelComparisonPanel,
  type ComparisonEntry,
} from './model-comparison-panel';

const A: ComparisonEntry = {
  modelId: 'bge-small',
  name: 'BGE Small',
  score: 88,
  sizeMB: 34,
  size: '34 MB',
  speedTier: 'fast',
  qualityTier: 'high',
  device: 'webgpu',
  dimensions: 384,
};

const B: ComparisonEntry = {
  modelId: 'arctic-xs',
  name: 'Arctic XS',
  score: 79,
  sizeMB: 90,
  size: '90 MB',
  speedTier: 'medium',
  qualityTier: 'medium',
  device: 'wasm',
  dimensions: 384,
};

/**
 * Demo for ModelComparisonPanel. Shows two recommendations side by side with
 * winning rows accent-highlighted; Clear dismisses the panel.
 */
export default function ModelComparisonPanelDemo() {
  const [open, setOpen] = useState(true);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
      >
        Compare again
      </button>
    );
  }
  return <ModelComparisonPanel entries={[A, B]} onClear={() => setOpen(false)} />;
}
