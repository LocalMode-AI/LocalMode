/**
 * MediaPipe Face Tracker (streaming)
 *
 * Real-time 478-point face mesh tracking over a video element.
 *
 * @packageDocumentation
 */

import type { FaceLandmarkResultItem, FaceBlendshape } from '@localmode/core';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { DEFAULT_MODELS, resolveModelUrl } from '../models.js';
import { resolveWasmPath, mapLandmark } from '../utils.js';
import { StreamingTracker } from './tracker-base.js';
import type { FaceTracker, FaceTrackerOptions } from './types.js';

class FaceStreamingTracker extends StreamingTracker<FaceLandmarker> {
  constructor(private readonly options: FaceTrackerOptions) {
    super(options.video, 'mediapipe:face_landmarker', options.onError);
  }

  protected async loadTask(): Promise<FaceLandmarker> {
    const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision');
    const wasmPath = resolveWasmPath('vision', this.options.wasmBasePath);
    const fileset = await FilesetResolver.forVisionTasks(wasmPath);
    return FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: resolveModelUrl(DEFAULT_MODELS.face_landmarker, this.options.modelPath),
        delegate: this.options.delegate ?? 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: this.options.numFaces ?? 1,
      outputFaceBlendshapes: this.options.outputBlendshapes ?? false,
    });
  }

  protected processFrame(task: FaceLandmarker, timestampMs: number): void {
    const raw = task.detectForVideo(this.video, timestampMs);
    const faces: FaceLandmarkResultItem[] = raw.faceLandmarks.map((landmarks, i) => {
      const item: FaceLandmarkResultItem = {
        landmarks: landmarks.map(mapLandmark),
        score: 1,
      };
      if (this.options.outputBlendshapes && raw.faceBlendshapes[i]) {
        const blendshapes: FaceBlendshape[] = raw.faceBlendshapes[i].categories.map((c) => ({
          categoryName: c.categoryName,
          score: c.score,
        }));
        item.blendshapes = blendshapes;
      }
      return item;
    });
    this.options.onResults(faces, timestampMs);
  }
}

/**
 * Create a real-time face mesh tracker for a video element.
 *
 * @param options - Tracker options including the video element and callback
 * @returns A face tracker; call `start()` to begin processing
 *
 * @example
 * ```ts
 * const tracker = createFaceTracker({
 *   video: videoEl,
 *   outputBlendshapes: true,
 *   onResults: (faces) => console.log(`${faces.length} faces`),
 * });
 * await tracker.start();
 * ```
 */
export function createFaceTracker(options: FaceTrackerOptions): FaceTracker {
  return new FaceStreamingTracker(options);
}
