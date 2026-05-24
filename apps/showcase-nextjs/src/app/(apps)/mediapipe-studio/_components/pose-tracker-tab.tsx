/**
 * @file pose-tracker-tab.tsx
 * @description Real-time body pose tracking tab
 */
'use client';

import { POSE_CONNECTIONS, type PoseLandmarkResultItem } from '@localmode/core';
import { useWebcam, usePoseTracker } from '../_hooks';
import { TrackerTab } from './tracker-tab';
import { drawConnections, drawPoints } from '../_lib/utils';
import { OVERLAY } from '../_lib/constants';

/** Draw the 33-point pose skeleton for every detected person. */
function drawPoses(ctx: CanvasRenderingContext2D, poses: PoseLandmarkResultItem[]) {
  for (const pose of poses) {
    drawConnections(ctx, pose.landmarks, POSE_CONNECTIONS, OVERLAY.poseColor);
    drawPoints(ctx, pose.landmarks, '#ffffff', 3);
  }
}

/** Pose estimation tab — 33-point body skeleton. */
export function PoseTrackerTab() {
  const webcam = useWebcam();
  const tracker = usePoseTracker(webcam.videoRef);

  const sidebar = (
    <div className="card bg-poster-surface p-4">
      <h3 className="mb-2 text-sm font-semibold text-poster-text-main">Pose</h3>
      <p className="text-sm text-poster-text-sub">
        {tracker.results.length > 0
          ? `Tracking ${tracker.results.length} person(s) — 33 body landmarks each.`
          : 'Stand back so your full body is visible to see the skeleton overlay.'}
      </p>
    </div>
  );

  return (
    <TrackerTab
      webcam={webcam}
      tracker={tracker}
      draw={drawPoses}
      idleHint="Start the camera and step back to see a full-body 33-point skeleton."
      sidebar={sidebar}
    />
  );
}
