/**
 * MediaPipe Gesture Recognizer
 *
 * Implements the core `GestureRecognitionModel` interface using
 * `@mediapipe/tasks-vision`'s `GestureRecognizer` task.
 *
 * @packageDocumentation
 */

import type {
  GestureRecognitionModel,
  DoRecognizeGestureOptions,
  DoRecognizeGestureResult,
  GestureResultItem,
} from '@localmode/core';
import { VisionError } from '@localmode/core';
import type { GestureRecognizer } from '@mediapipe/tasks-vision';
import type { MediaPipeModelSettings, MediaPipeProviderSettings } from '../types.js';
import { resolveModelUrl } from '../models.js';
import { resolveWasmPath, toImageSource, releaseImageSource, mapLandmark } from '../utils.js';
import { LazyMediaPipeTask } from './base.js';

/**
 * Hand gesture recognition model backed by MediaPipe's `GestureRecognizer`.
 */
export class MediaPipeGestureRecognizer implements GestureRecognitionModel {
  readonly modelId: string;
  readonly provider = 'mediapipe';

  private readonly task: LazyMediaPipeTask<GestureRecognizer>;

  constructor(
    modelId: string,
    settings: MediaPipeModelSettings = {},
    providerSettings: MediaPipeProviderSettings = {}
  ) {
    this.modelId = `mediapipe:${modelId}`;
    const modelUrl = resolveModelUrl(modelId, settings.modelPath);
    const wasmPath = resolveWasmPath('vision', providerSettings.wasmBasePath, settings.wasmBasePath);
    const delegate = settings.delegate ?? providerSettings.delegate ?? 'GPU';

    this.task = new LazyMediaPipeTask<GestureRecognizer>(async () => {
      const { FilesetResolver, GestureRecognizer } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(wasmPath);
      return GestureRecognizer.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: 'IMAGE',
        numHands: 2,
      });
    }, this.modelId);
  }

  async doRecognize(
    options: DoRecognizeGestureOptions
  ): Promise<DoRecognizeGestureResult> {
    const { images, numHands = 2, abortSignal } = options;
    abortSignal?.throwIfAborted();

    const recognizer = await this.task.get();
    abortSignal?.throwIfAborted();
    recognizer.setOptions({ numHands });

    const startTime = performance.now();
    const results: GestureResultItem[][] = [];

    try {
      for (const image of images) {
        abortSignal?.throwIfAborted();
        const source = await toImageSource(image);
        const raw = recognizer.recognize(source);
        releaseImageSource(source);

        const gestures: GestureResultItem[] = raw.landmarks.map((landmarks, i) => ({
          gesture: raw.gestures[i]?.[0]?.categoryName ?? 'None',
          score: raw.gestures[i]?.[0]?.score ?? 0,
          handedness: (raw.handedness[i]?.[0]?.categoryName === 'Left'
            ? 'Left'
            : 'Right') as 'Left' | 'Right',
          landmarks: landmarks.map(mapLandmark),
        }));
        results.push(gestures);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new VisionError(
        `Gesture recognition failed: ${(error as Error)?.message ?? String(error)}`,
        {
          hint: 'Ensure the image is a valid Blob, ImageData, ArrayBuffer, or URL.',
          cause: error instanceof Error ? error : undefined,
        }
      );
    }

    return {
      results,
      usage: { durationMs: performance.now() - startTime },
    };
  }

  /** Dispose the underlying MediaPipe task and free WASM resources. */
  close(): void {
    this.task.close();
  }
}
