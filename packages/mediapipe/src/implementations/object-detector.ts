/**
 * MediaPipe Object Detector
 *
 * Implements the core `ObjectDetectionModel` interface using
 * `@mediapipe/tasks-vision`'s `ObjectDetector` task.
 *
 * @packageDocumentation
 */

import type {
  ObjectDetectionModel,
  DoDetectObjectsOptions,
  DoDetectObjectsResult,
  ObjectDetectionResultItem,
  DetectedObject,
} from '@localmode/core';
import { VisionError } from '@localmode/core';
import type { ObjectDetector } from '@mediapipe/tasks-vision';
import type { MediaPipeModelSettings, MediaPipeProviderSettings } from '../types.js';
import { resolveModelUrl } from '../models.js';
import { resolveWasmPath, toImageSource, releaseImageSource } from '../utils.js';
import { LazyMediaPipeTask } from './base.js';

/**
 * Object detection model backed by MediaPipe's `ObjectDetector`.
 */
export class MediaPipeObjectDetector implements ObjectDetectionModel {
  readonly modelId: string;
  readonly provider = 'mediapipe';

  private readonly task: LazyMediaPipeTask<ObjectDetector>;

  constructor(
    modelId: string,
    settings: MediaPipeModelSettings = {},
    providerSettings: MediaPipeProviderSettings = {}
  ) {
    this.modelId = `mediapipe:${modelId}`;
    const modelUrl = resolveModelUrl(modelId, settings.modelPath);
    const wasmPath = resolveWasmPath('vision', providerSettings.wasmBasePath, settings.wasmBasePath);
    const delegate = settings.delegate ?? providerSettings.delegate ?? 'GPU';

    this.task = new LazyMediaPipeTask<ObjectDetector>(async () => {
      const { FilesetResolver, ObjectDetector } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(wasmPath);
      return ObjectDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: 'IMAGE',
      });
    }, this.modelId);
  }

  async doDetect(options: DoDetectObjectsOptions): Promise<DoDetectObjectsResult> {
    const { images, threshold, abortSignal } = options;
    abortSignal?.throwIfAborted();

    const detector = await this.task.get();
    abortSignal?.throwIfAborted();
    if (threshold !== undefined) {
      detector.setOptions({ scoreThreshold: threshold });
    }

    const startTime = performance.now();
    const results: ObjectDetectionResultItem[] = [];

    try {
      for (const image of images) {
        abortSignal?.throwIfAborted();
        const source = await toImageSource(image);
        const raw = detector.detect(source);
        releaseImageSource(source);

        const objects: DetectedObject[] = raw.detections.map((det) => ({
          label: det.categories[0]?.categoryName || det.categories[0]?.displayName || 'object',
          score: det.categories[0]?.score ?? 0,
          box: {
            x: det.boundingBox?.originX ?? 0,
            y: det.boundingBox?.originY ?? 0,
            width: det.boundingBox?.width ?? 0,
            height: det.boundingBox?.height ?? 0,
          },
        }));
        results.push({ objects });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new VisionError(
        `Object detection failed: ${(error as Error)?.message ?? String(error)}`,
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
