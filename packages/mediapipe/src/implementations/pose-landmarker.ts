/**
 * MediaPipe Pose Landmarker
 *
 * Implements the core `PoseLandmarkModel` interface using
 * `@mediapipe/tasks-vision`'s `PoseLandmarker` task.
 *
 * @packageDocumentation
 */

import type {
  PoseLandmarkModel,
  DoDetectPoseOptions,
  DoDetectPoseResult,
  PoseLandmarkResultItem,
} from '@localmode/core';
import { VisionError } from '@localmode/core';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import type { MediaPipeModelSettings, MediaPipeProviderSettings } from '../types.js';
import { resolveModelUrl } from '../models.js';
import { resolveWasmPath, toImageSource, releaseImageSource, mapLandmark } from '../utils.js';
import { LazyMediaPipeTask } from './base.js';

/**
 * Pose landmark detection model backed by MediaPipe's `PoseLandmarker`.
 */
export class MediaPipePoseLandmarker implements PoseLandmarkModel {
  readonly modelId: string;
  readonly provider = 'mediapipe';

  private readonly task: LazyMediaPipeTask<PoseLandmarker>;

  constructor(
    modelId: string,
    settings: MediaPipeModelSettings = {},
    providerSettings: MediaPipeProviderSettings = {}
  ) {
    this.modelId = `mediapipe:${modelId}`;
    const modelUrl = resolveModelUrl(modelId, settings.modelPath);
    const wasmPath = resolveWasmPath('vision', providerSettings.wasmBasePath, settings.wasmBasePath);
    const delegate = settings.delegate ?? providerSettings.delegate ?? 'GPU';

    this.task = new LazyMediaPipeTask<PoseLandmarker>(async () => {
      const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(wasmPath);
      return PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: 'IMAGE',
        numPoses: 1,
      });
    }, this.modelId);
  }

  async doDetect(options: DoDetectPoseOptions): Promise<DoDetectPoseResult> {
    const { images, numPoses = 1, abortSignal } = options;
    abortSignal?.throwIfAborted();

    const landmarker = await this.task.get();
    abortSignal?.throwIfAborted();
    landmarker.setOptions({ numPoses });

    const startTime = performance.now();
    const results: PoseLandmarkResultItem[][] = [];

    try {
      for (const image of images) {
        abortSignal?.throwIfAborted();
        const source = await toImageSource(image);
        const raw = landmarker.detect(source);
        releaseImageSource(source);

        const poses: PoseLandmarkResultItem[] = raw.landmarks.map((landmarks, i) => ({
          landmarks: landmarks.map(mapLandmark),
          worldLandmarks: (raw.worldLandmarks[i] ?? []).map(mapLandmark),
          score:
            landmarks.length > 0
              ? landmarks.reduce((sum, l) => sum + (l.visibility ?? 0), 0) / landmarks.length
              : 0,
        }));
        results.push(poses);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new VisionError(
        `Pose landmark detection failed: ${(error as Error)?.message ?? String(error)}`,
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
