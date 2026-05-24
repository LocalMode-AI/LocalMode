/**
 * @file hand-tracker-tab.tsx
 * @description Real-time hand landmark tracking tab
 */
'use client';

import { HAND_CONNECTIONS, type HandLandmarkResultItem } from '@localmode/core';
import { useWebcam, useHandTracker } from '../_hooks';
import { TrackerTab } from './tracker-tab';
import { Badge } from './ui';
import { drawHand } from '../_lib/utils';

/** Draw all detected hands with per-finger colored landmarks. */
function drawHands(ctx: CanvasRenderingContext2D, hands: HandLandmarkResultItem[]) {
  for (const hand of hands) {
    drawHand(ctx, hand.landmarks, HAND_CONNECTIONS);
  }
}

/** Hand tracking tab — 21-point hand landmarks with handedness. */
export function HandTrackerTab() {
  const webcam = useWebcam();
  const tracker = useHandTracker(webcam.videoRef);

  const sidebar = (
    <div className="card bg-poster-surface p-4">
      <h3 className="mb-2 text-sm font-semibold text-poster-text-main">Detected Hands</h3>
      {tracker.results.length === 0 ? (
        <p className="text-sm text-poster-text-sub">No hands detected yet.</p>
      ) : (
        <div className="space-y-2">
          {tracker.results.map((hand, i) => (
            <div key={i} className="flex items-center justify-between">
              <Badge variant="primary">{hand.handedness} hand</Badge>
              <span className="text-xs text-poster-text-sub">
                {(hand.score * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <TrackerTab
      webcam={webcam}
      tracker={tracker}
      draw={drawHands}
      idleHint="Start the camera and hold up your hands to see 21-point hand landmarks."
      sidebar={sidebar}
    />
  );
}
