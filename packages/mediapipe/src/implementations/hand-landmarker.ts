/**
 * MediaPipe Hand Landmarker
 *
 * Implements the core `HandLandmarkModel` interface using
 * `@mediapipe/tasks-vision`'s `HandLandmarker` task.
 *
 * @packageDocumentation
 */

import type {
  HandLandmarkModel,
  DoDetectHandsOptions,
  DoDetectHandsResult,
  HandLandmarkResultItem,
} from '@localmode/core';
import { VisionError } from '@localmode/core';
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import type { MediaPipeModelSettings, MediaPipeProviderSettings } from '../types.js';
import { resolveModelUrl } from '../models.js';
import { resolveWasmPath, toImageSource, releaseImageSource, mapLandmark } from '../utils.js';
import { LazyMediaPipeTask } from './base.js';

/**
 * Hand landmark detection model backed by MediaPipe's `HandLandmarker`.
 */
export class MediaPipeHandLandmarker implements HandLandmarkModel {
  readonly modelId: string;
  readonly provider = 'mediapipe';

  private readonly task: LazyMediaPipeTask<HandLandmarker>;

  constructor(
    modelId: string,
    settings: MediaPipeModelSettings = {},
    providerSettings: MediaPipeProviderSettings = {}
  ) {
    this.modelId = `mediapipe:${modelId}`;
    const modelUrl = resolveModelUrl(modelId, settings.modelPath);
    const wasmPath = resolveWasmPath('vision', providerSettings.wasmBasePath, settings.wasmBasePath);
    const delegate = settings.delegate ?? providerSettings.delegate ?? 'GPU';

    this.task = new LazyMediaPipeTask<HandLandmarker>(async () => {
      const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(wasmPath);
      return HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: 'IMAGE',
        numHands: 2,
      });
    }, this.modelId);
  }

  async doDetect(options: DoDetectHandsOptions): Promise<DoDetectHandsResult> {
    const { images, numHands = 2, abortSignal } = options;
    abortSignal?.throwIfAborted();

    const landmarker = await this.task.get();
    abortSignal?.throwIfAborted();
    landmarker.setOptions({ numHands });

    const startTime = performance.now();
    const results: HandLandmarkResultItem[][] = [];

    try {
      for (const image of images) {
        abortSignal?.throwIfAborted();
        const source = await toImageSource(image);
        const raw = landmarker.detect(source);
        releaseImageSource(source);

        const hands: HandLandmarkResultItem[] = raw.landmarks.map((landmarks, i) => ({
          landmarks: landmarks.map(mapLandmark),
          worldLandmarks: (raw.worldLandmarks[i] ?? []).map(mapLandmark),
          handedness: (raw.handedness[i]?.[0]?.categoryName === 'Left'
            ? 'Left'
            : 'Right') as 'Left' | 'Right',
          score: raw.handedness[i]?.[0]?.score ?? 0,
        }));
        results.push(hands);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new VisionError(
        `Hand landmark detection failed: ${(error as Error)?.message ?? String(error)}`,
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
