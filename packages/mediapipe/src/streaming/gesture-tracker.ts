/**
 * MediaPipe Gesture Tracker (streaming)
 *
 * Real-time hand gesture recognition over a video element.
 *
 * @packageDocumentation
 */

import type { GestureResultItem } from '@localmode/core';
import type { GestureRecognizer } from '@mediapipe/tasks-vision';
import { DEFAULT_MODELS, resolveModelUrl } from '../models.js';
import { resolveWasmPath, mapLandmark } from '../utils.js';
import { StreamingTracker } from './tracker-base.js';
import type { GestureTracker, GestureTrackerOptions } from './types.js';

class GestureStreamingTracker extends StreamingTracker<GestureRecognizer> {
  constructor(private readonly options: GestureTrackerOptions) {
    super(options.video, 'mediapipe:gesture_recognizer', options.onError);
  }

  protected async loadTask(): Promise<GestureRecognizer> {
    const { FilesetResolver, GestureRecognizer } = await import('@mediapipe/tasks-vision');
    const wasmPath = resolveWasmPath('vision', this.options.wasmBasePath);
    const fileset = await FilesetResolver.forVisionTasks(wasmPath);
    return GestureRecognizer.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: resolveModelUrl(
          DEFAULT_MODELS.gesture_recognizer,
          this.options.modelPath
        ),
        delegate: this.options.delegate ?? 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: this.options.numHands ?? 2,
    });
  }

  protected processFrame(task: GestureRecognizer, timestampMs: number): void {
    const raw = task.recognizeForVideo(this.video, timestampMs);
    const gestures: GestureResultItem[] = raw.landmarks.map((landmarks, i) => ({
      gesture: raw.gestures[i]?.[0]?.categoryName ?? 'None',
      score: raw.gestures[i]?.[0]?.score ?? 0,
      handedness: (raw.handedness[i]?.[0]?.categoryName === 'Left' ? 'Left' : 'Right') as
        | 'Left'
        | 'Right',
      landmarks: landmarks.map(mapLandmark),
    }));
    this.options.onResults(gestures, timestampMs);
  }
}

/**
 * Create a real-time gesture tracker for a video element.
 *
 * @param options - Tracker options including the video element and callback
 * @returns A gesture tracker; call `start()` to begin processing
 *
 * @example
 * ```ts
 * const tracker = createGestureTracker({
 *   video: videoEl,
 *   onResults: (gestures) => console.log(gestures[0]?.gesture),
 * });
 * await tracker.start();
 * ```
 */
export function createGestureTracker(options: GestureTrackerOptions): GestureTracker {
  return new GestureStreamingTracker(options);
}
