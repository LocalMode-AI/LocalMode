/**
 * MediaPipe Face Landmarker
 *
 * Implements the core `FaceLandmarkModel` interface using
 * `@mediapipe/tasks-vision`'s `FaceLandmarker` task (478-point face mesh).
 *
 * @packageDocumentation
 */

import type {
  FaceLandmarkModel,
  DoDetectFaceLandmarksOptions,
  DoDetectFaceLandmarksResult,
  FaceLandmarkResultItem,
  FaceBlendshape,
} from '@localmode/core';
import { VisionError } from '@localmode/core';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import type { MediaPipeModelSettings, MediaPipeProviderSettings } from '../types.js';
import { resolveModelUrl } from '../models.js';
import { resolveWasmPath, toImageSource, releaseImageSource, mapLandmark } from '../utils.js';
import { LazyMediaPipeTask } from './base.js';

/**
 * Face landmark (478-point mesh) detection model backed by MediaPipe's
 * `FaceLandmarker`.
 */
export class MediaPipeFaceLandmarker implements FaceLandmarkModel {
  readonly modelId: string;
  readonly provider = 'mediapipe';

  private readonly task: LazyMediaPipeTask<FaceLandmarker>;

  constructor(
    modelId: string,
    settings: MediaPipeModelSettings = {},
    providerSettings: MediaPipeProviderSettings = {}
  ) {
    this.modelId = `mediapipe:${modelId}`;
    const modelUrl = resolveModelUrl(modelId, settings.modelPath);
    const wasmPath = resolveWasmPath('vision', providerSettings.wasmBasePath, settings.wasmBasePath);
    const delegate = settings.delegate ?? providerSettings.delegate ?? 'GPU';

    this.task = new LazyMediaPipeTask<FaceLandmarker>(async () => {
      const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(wasmPath);
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: 'IMAGE',
        numFaces: 1,
      });
    }, this.modelId);
  }

  async doDetect(
    options: DoDetectFaceLandmarksOptions
  ): Promise<DoDetectFaceLandmarksResult> {
    const { images, numFaces = 1, outputBlendshapes = false, abortSignal } = options;
    abortSignal?.throwIfAborted();

    const landmarker = await this.task.get();
    abortSignal?.throwIfAborted();
    landmarker.setOptions({ numFaces, outputFaceBlendshapes: outputBlendshapes });

    const startTime = performance.now();
    const results: FaceLandmarkResultItem[][] = [];

    try {
      for (const image of images) {
        abortSignal?.throwIfAborted();
        const source = await toImageSource(image);
        const raw = landmarker.detect(source);
        releaseImageSource(source);

        const faces: FaceLandmarkResultItem[] = raw.faceLandmarks.map((landmarks, i) => {
          // The face mesh model does not emit a per-face confidence; a returned
          // face has already passed the detection confidence threshold.
          const item: FaceLandmarkResultItem = {
            landmarks: landmarks.map(mapLandmark),
            score: 1,
          };
          if (outputBlendshapes && raw.faceBlendshapes[i]) {
            const blendshapes: FaceBlendshape[] = raw.faceBlendshapes[i].categories.map(
              (c) => ({ categoryName: c.categoryName, score: c.score })
            );
            item.blendshapes = blendshapes;
          }
          return item;
        });
        results.push(faces);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new VisionError(
        `Face landmark detection failed: ${(error as Error)?.message ?? String(error)}`,
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
