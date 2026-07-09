'use client';

import { FormatDetectionBadge } from './format-detection-badge';

/**
 * Demo for the FormatDetectionBadge component, used by the docs live preview.
 * Shows each built-in format color, an unknown format (neutral fallback), and
 * the pending state. Fully presentational — no model download.
 */
export default function FormatDetectionBadgeDemo() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <FormatDetectionBadge format="pinecone" />
      <FormatDetectionBadge format="chroma" />
      <FormatDetectionBadge format="csv" />
      <FormatDetectionBadge format="jsonl" />
      <FormatDetectionBadge format="parquet" />
      <FormatDetectionBadge format={null} />
    </div>
  );
}
