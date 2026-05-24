/**
 * @file face-tracker-tab.tsx
 * @description Real-time face mesh tracking tab
 */
'use client';

import { useState } from 'react';
import { FACE_CONNECTIONS, type FaceLandmarkResultItem } from '@localmode/core';
import { useWebcam, useFaceTracker } from '../_hooks';
import { TrackerTab } from './tracker-tab';
import { drawConnections, drawPoints, formatPercent } from '../_lib/utils';
import { OVERLAY } from '../_lib/constants';

/** Draw the face mesh wireframe for every detected face. */
function drawFaces(ctx: CanvasRenderingContext2D, faces: FaceLandmarkResultItem[]) {
  for (const face of faces) {
    drawConnections(ctx, face.landmarks, FACE_CONNECTIONS, OVERLAY.faceColor);
    drawPoints(ctx, face.landmarks, 'rgba(255,255,255,0.5)', 1);
  }
}

/** Face detection tab — 478-point face mesh with optional blendshapes. */
export function FaceTrackerTab() {
  const [showBlendshapes, setShowBlendshapes] = useState(true);
  const webcam = useWebcam();
  const tracker = useFaceTracker(webcam.videoRef, showBlendshapes);

  const blendshapes = tracker.results[0]?.blendshapes ?? [];
  const topBlendshapes = [...blendshapes].sort((a, b) => b.score - a.score).slice(0, 8);

  const sidebar = (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-poster-text-main">
        <input
          type="checkbox"
          className="checkbox checkbox-sm"
          checked={showBlendshapes}
          onChange={(e) => setShowBlendshapes(e.target.checked)}
        />
        Show expression blendshapes
      </label>

      {showBlendshapes && (
        <div className="card bg-poster-surface p-4">
          <h3 className="mb-2 text-sm font-semibold text-poster-text-main">Blendshapes</h3>
          {topBlendshapes.length === 0 ? (
            <p className="text-sm text-poster-text-sub">No face detected yet.</p>
          ) : (
            <div className="space-y-1.5">
              {topBlendshapes.map((shape) => (
                <div key={shape.categoryName} className="text-xs">
                  <div className="flex justify-between text-poster-text-sub">
                    <span>{shape.categoryName}</span>
                    <span>{formatPercent(shape.score)}</span>
                  </div>
                  <progress
                    className="progress progress-primary h-1.5"
                    value={shape.score}
                    max={1}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <TrackerTab
      webcam={webcam}
      tracker={tracker}
      draw={drawFaces}
      idleHint="Start the camera and face it to see a 478-point face mesh."
      sidebar={sidebar}
    />
  );
}
