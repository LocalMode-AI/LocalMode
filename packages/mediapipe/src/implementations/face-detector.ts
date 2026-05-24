/**
 * MediaPipe Face Detector
 *
 * Implements the core `FaceDetectionModel` interface using
 * `@mediapipe/tasks-vision`'s `FaceDetector` task.
 *
 * @packageDocumentation
 */

import type {
  FaceDetectionModel,
  DoDetectFacesOptions,
  DoDetectFacesResult,
  FaceDetectionResultItem,
  FaceKeypoint,
} from '@localmode/core';
import { VisionError } from '@localmode/core';
import type { FaceDetector } from '@mediapipe/tasks-vision';
import type { MediaPipeModelSettings, MediaPipeProviderSettings } from '../types.js';
import { resolveModelUrl } from '../models.js';
import { resolveWasmPath, toImageSource, releaseImageSource } from '../utils.js';
import { LazyMediaPipeTask } from './base.js';

/** Keypoint names for BlazeFace's 6 facial keypoints, in detection order. */
const FACE_KEYPOINT_NAMES = [
  'rightEye',
  'leftEye',
  'noseTip',
  'mouthCenter',
  'rightEarTragion',
  'leftEarTragion',
];

/**
 * Face detection model backed by MediaPipe's `FaceDetector`.
 */
export class MediaPipeFaceDetector implements FaceDetectionModel {
  readonly modelId: string;
  readonly provider = 'mediapipe';

  private readonly task: LazyMediaPipeTask<FaceDetector>;

  constructor(
    modelId: string,
    settings: MediaPipeModelSettings = {},
    providerSettings: MediaPipeProviderSettings = {}
  ) {
    this.modelId = `mediapipe:${modelId}`;
    const modelUrl = resolveModelUrl(modelId, settings.modelPath);
    const wasmPath = resolveWasmPath('vision', providerSettings.wasmBasePath, settings.wasmBasePath);
    const delegate = settings.delegate ?? providerSettings.delegate ?? 'GPU';

    this.task = new LazyMediaPipeTask<FaceDetector>(async () => {
      const { FilesetResolver, FaceDetector } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(wasmPath);
      return FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: 'IMAGE',
      });
    }, this.modelId);
  }

  async doDetect(options: DoDetectFacesOptions): Promise<DoDetectFacesResult> {
    const { images, minDetectionConfidence, abortSignal } = options;
    abortSignal?.throwIfAborted();

    const detector = await this.task.get();
    abortSignal?.throwIfAborted();
    if (minDetectionConfidence !== undefined) {
      detector.setOptions({ minDetectionConfidence });
    }

    const startTime = performance.now();
    const results: FaceDetectionResultItem[][] = [];

    try {
      for (const image of images) {
        abortSignal?.throwIfAborted();
        const source = await toImageSource(image);
        const raw = detector.detect(source);
        releaseImageSource(source);

        const faces: FaceDetectionResultItem[] = raw.detections.map((det) => {
          const keypoints: FaceKeypoint[] = (det.keypoints ?? []).map((kp, i) => ({
            x: kp.x,
            y: kp.y,
            name: kp.label ?? FACE_KEYPOINT_NAMES[i] ?? `keypoint${i}`,
          }));
          return {
            box: {
              x: det.boundingBox?.originX ?? 0,
              y: det.boundingBox?.originY ?? 0,
              width: det.boundingBox?.width ?? 0,
              height: det.boundingBox?.height ?? 0,
            },
            score: det.categories[0]?.score ?? 0,
            keypoints,
          };
        });
        faces.sort((a, b) => b.score - a.score);
        results.push(faces);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new VisionError(
        `Face detection failed: ${(error as Error)?.message ?? String(error)}`,
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
