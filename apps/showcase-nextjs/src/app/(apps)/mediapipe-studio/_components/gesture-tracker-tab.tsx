/**
 * @file gesture-tracker-tab.tsx
 * @description Real-time hand gesture recognition tab
 */
'use client';

import { HAND_CONNECTIONS, type GestureResultItem } from '@localmode/core';
import { useWebcam, useGestureTracker } from '../_hooks';
import { TrackerTab } from './tracker-tab';
import { drawHand, formatPercent } from '../_lib/utils';
import { GESTURE_LABELS } from '../_lib/constants';

/** Draw the hand landmarks for each recognized gesture. */
function drawGestures(ctx: CanvasRenderingContext2D, gestures: GestureResultItem[]) {
  for (const gesture of gestures) {
    drawHand(ctx, gesture.landmarks, HAND_CONNECTIONS);
  }
}

/** Gesture recognition tab — recognizes 8 hand gestures. */
export function GestureTrackerTab() {
  const webcam = useWebcam();
  const tracker = useGestureTracker(webcam.videoRef);

  const topGesture = tracker.results.find((g) => g.gesture !== 'None') ?? tracker.results[0];

  const sidebar = (
    <div className="card bg-poster-surface p-5 text-center">
      <h3 className="mb-3 text-sm font-semibold text-poster-text-main">Recognized Gesture</h3>
      {topGesture ? (
        <>
          <p className="text-2xl font-bold text-poster-primary">
            {GESTURE_LABELS[topGesture.gesture] ?? topGesture.gesture}
          </p>
          <p className="mt-1 text-xs text-poster-text-sub">
            {formatPercent(topGesture.score)} confidence · {topGesture.handedness} hand
          </p>
        </>
      ) : (
        <p className="text-sm text-poster-text-sub">
          Make a gesture — thumbs up, victory, open palm, fist…
        </p>
      )}
    </div>
  );

  return (
    <TrackerTab
      webcam={webcam}
      tracker={tracker}
      draw={drawGestures}
      idleHint="Start the camera and make a hand gesture to have it recognized."
      sidebar={sidebar}
    />
  );
}
