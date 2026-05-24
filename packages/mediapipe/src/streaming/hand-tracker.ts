/**
 * MediaPipe Hand Tracker (streaming)
 *
 * Real-time hand landmark tracking over a video element.
 *
 * @packageDocumentation
 */

import type { HandLandmarkResultItem } from '@localmode/core';
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { DEFAULT_MODELS, resolveModelUrl } from '../models.js';
import { resolveWasmPath, mapLandmark } from '../utils.js';
import { StreamingTracker } from './tracker-base.js';
import type { HandTracker, HandTrackerOptions } from './types.js';

class HandStreamingTracker extends StreamingTracker<HandLandmarker> {
  constructor(private readonly options: HandTrackerOptions) {
    super(options.video, 'mediapipe:hand_landmarker', options.onError);
  }

  protected async loadTask(): Promise<HandLandmarker> {
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
    const wasmPath = resolveWasmPath('vision', this.options.wasmBasePath);
    const fileset = await FilesetResolver.forVisionTasks(wasmPath);
    return HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: resolveModelUrl(DEFAULT_MODELS.hand_landmarker, this.options.modelPath),
        delegate: this.options.delegate ?? 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: this.options.numHands ?? 2,
    });
  }

  protected processFrame(task: HandLandmarker, timestampMs: number): void {
    const raw = task.detectForVideo(this.video, timestampMs);
    const hands: HandLandmarkResultItem[] = raw.landmarks.map((landmarks, i) => ({
      landmarks: landmarks.map(mapLandmark),
      worldLandmarks: (raw.worldLandmarks[i] ?? []).map(mapLandmark),
      handedness: (raw.handedness[i]?.[0]?.categoryName === 'Left' ? 'Left' : 'Right') as
        | 'Left'
        | 'Right',
      score: raw.handedness[i]?.[0]?.score ?? 0,
    }));
    this.options.onResults(hands, timestampMs);
  }
}

/**
 * Create a real-time hand tracker for a video element.
 *
 * @param options - Tracker options including the video element and callback
 * @returns A hand tracker; call `start()` to begin processing
 *
 * @example
 * ```ts
 * const tracker = createHandTracker({
 *   video: videoEl,
 *   onResults: (hands) => console.log(`${hands.length} hands`),
 * });
 * await tracker.start();
 * ```
 */
export function createHandTracker(options: HandTrackerOptions): HandTracker {
  return new HandStreamingTracker(options);
}
