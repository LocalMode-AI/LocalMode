'use client';

/**
 * @file chart-artifact-demo.tsx
 * @description Demo for ChartArtifact, used by the docs live preview. Shows a
 * radar of precision/recall/F1 (the canonical `useEvaluateModel` output) and a
 * scatter of a 2D embedding projection — both rendered from local data, no
 * model download required for the preview.
 */

import { ChartArtifact } from './chart-artifact';

/** Stand-in for a real `evaluateModel()` result (precision/recall/F1). */
const EVAL = [
  { label: 'Precision', value: 0.91 },
  { label: 'Recall', value: 0.84 },
  { label: 'F1', value: 0.87 },
  { label: 'Accuracy', value: 0.89 },
];

/** Stand-in for a 2D embedding projection (PCA/UMAP scatter). */
const PROJECTION = [
  { x: -1.2, y: 0.8 },
  { x: -0.9, y: 1.1 },
  { x: 0.4, y: -0.6 },
  { x: 0.7, y: -0.9 },
  { x: 1.4, y: 0.2 },
  { x: -0.3, y: -1.3 },
];

export default function ChartArtifactDemo() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ChartArtifact type="radar" title="Eval (P / R / F1)" data={EVAL} />
      <ChartArtifact
        type="scatter"
        title="Embedding projection (2D)"
        data={PROJECTION}
      />
    </div>
  );
}
