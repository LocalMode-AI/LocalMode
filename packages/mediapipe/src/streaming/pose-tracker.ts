/**
 * MediaPipe Pose Tracker (streaming)
 *
 * Real-time body pose landmark tracking over a video element.
 *
 * @packageDocumentation
 */

import type { PoseLandmarkResultItem } from '@localmode/core';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { DEFAULT_MODELS, resolveModelUrl } from '../models.js';
import { resolveWasmPath, mapLandmark } from '../utils.js';
import { StreamingTracker } from './tracker-base.js';
import type { PoseTracker, PoseTrackerOptions } from './types.js';

class PoseStreamingTracker extends StreamingTracker<PoseLandmarker> {
  constructor(private readonly options: PoseTrackerOptions) {
    super(options.video, 'mediapipe:pose_landmarker', options.onError);
  }

  protected async loadTask(): Promise<PoseLandmarker> {
    const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
    const wasmPath = resolveWasmPath('vision', this.options.wasmBasePath);
    const fileset = await FilesetResolver.forVisionTasks(wasmPath);
    return PoseLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: resolveModelUrl(DEFAULT_MODELS.pose_landmarker, this.options.modelPath),
        delegate: this.options.delegate ?? 'GPU',
      },
      runningMode: 'VIDEO',
      numPoses: this.options.numPoses ?? 1,
    });
  }

  protected processFrame(task: PoseLandmarker, timestampMs: number): void {
    const raw = task.detectForVideo(this.video, timestampMs);
    const poses: PoseLandmarkResultItem[] = raw.landmarks.map((landmarks, i) => ({
      landmarks: landmarks.map(mapLandmark),
      worldLandmarks: (raw.worldLandmarks[i] ?? []).map(mapLandmark),
      score:
        landmarks.length > 0
          ? landmarks.reduce((sum, l) => sum + (l.visibility ?? 0), 0) / landmarks.length
          : 0,
    }));
    this.options.onResults(poses, timestampMs);
  }
}

/**
 * Create a real-time pose tracker for a video element.
 *
 * @param options - Tracker options including the video element and callback
 * @returns A pose tracker; call `start()` to begin processing
 *
 * @example
 * ```ts
 * const tracker = createPoseTracker({
 *   video: videoEl,
 *   onResults: (poses) => console.log(`${poses.length} poses`),
 * });
 * await tracker.start();
 * ```
 */
export function createPoseTracker(options: PoseTrackerOptions): PoseTracker {
  return new PoseStreamingTracker(options);
}
