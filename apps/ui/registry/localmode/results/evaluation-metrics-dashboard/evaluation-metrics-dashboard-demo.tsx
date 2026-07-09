'use client';

import { EvaluationMetricsDashboard } from './evaluation-metrics-dashboard';

/**
 * Demo for the EvaluationMetricsDashboard component, used by the docs live
 * preview. Renders a full evaluation run (stats + metrics + confusion matrix +
 * radar + calibration) from sample data. Fully local.
 */
export default function EvaluationMetricsDashboardDemo() {
  return (
    <EvaluationMetricsDashboard
      stats={[
        { label: 'Dataset size', value: 200 },
        { label: 'Duration', value: '1.24s' },
        { label: 'Accuracy', value: '91.0%', delta: 2.4, deltaUnit: 'pts' },
        { label: 'Errors', value: 18, delta: -5, deltaUnit: '' },
      ]}
      metrics={[
        { label: 'Accuracy', value: 0.91 },
        { label: 'Precision', value: 0.89 },
        { label: 'Recall', value: 0.86 },
        { label: 'F1', value: 0.875 },
      ]}
      confusionMatrix={{
        labels: ['positive', 'neutral', 'negative'],
        matrix: [
          [58, 4, 2],
          [6, 49, 5],
          [1, 7, 62],
        ],
      }}
      calibration={{
        threshold: 0.624,
        percentile: 90,
        presetThreshold: 0.5,
        distribution: {
          mean: 0.41,
          median: 0.39,
          stdDev: 0.18,
          min: 0.02,
          max: 0.97,
          count: 200,
        },
      }}
    />
  );
}
