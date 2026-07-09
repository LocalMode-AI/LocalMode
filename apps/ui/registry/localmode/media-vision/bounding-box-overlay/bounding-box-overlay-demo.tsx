'use client';

import { BoundingBoxOverlay, DetectionLabelLegend } from './bounding-box-overlay';
import type { Detection } from './bounding-box-overlay';

/**
 * Demo for the BoundingBoxOverlay component, used by the docs live preview.
 * Uses a static placeholder image with fixed detections so the percentage
 * placement is visible at any container size — no model download.
 */
const NATURAL_WIDTH = 640;
const NATURAL_HEIGHT = 400;

const DETECTIONS: Detection[] = [
  { label: 'person', score: 0.98, box: { x: 64, y: 60, width: 200, height: 300 } },
  { label: 'dog', score: 0.91, box: { x: 320, y: 200, width: 240, height: 170 } },
  { label: 'frisbee', score: 0.74, box: { x: 430, y: 70, width: 110, height: 90 } },
];

export default function BoundingBoxOverlayDemo() {
  return (
    <div className="w-full max-w-lg space-y-3">
      <div className="relative overflow-hidden rounded-lg border border-border bg-muted">
        {/* A placeholder "image" surface at the natural aspect ratio. */}
        <div
          className="w-full bg-gradient-to-br from-muted to-muted-foreground/10"
          style={{ aspectRatio: `${NATURAL_WIDTH} / ${NATURAL_HEIGHT}` }}
        />
        <BoundingBoxOverlay
          detections={DETECTIONS}
          naturalWidth={NATURAL_WIDTH}
          naturalHeight={NATURAL_HEIGHT}
        />
      </div>
      <DetectionLabelLegend labels={DETECTIONS.map((d) => d.label)} />
    </div>
  );
}
