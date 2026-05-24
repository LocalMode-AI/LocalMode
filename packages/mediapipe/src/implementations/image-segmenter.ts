/**
 * MediaPipe Image Segmenter
 *
 * Implements the core `SegmentationModel` interface using
 * `@mediapipe/tasks-vision`'s `ImageSegmenter` task.
 *
 * @packageDocumentation
 */

import type {
  SegmentationModel,
  DoSegmentImageOptions,
  DoSegmentImageResult,
  SegmentationResultItem,
  SegmentMask,
} from '@localmode/core';
import { VisionError } from '@localmode/core';
import type { ImageSegmenter } from '@mediapipe/tasks-vision';
import type { MediaPipeModelSettings, MediaPipeProviderSettings } from '../types.js';
import { resolveModelUrl } from '../models.js';
import { resolveWasmPath, toImageSource, releaseImageSource } from '../utils.js';
import { LazyMediaPipeTask } from './base.js';

/**
 * Image segmentation model backed by MediaPipe's `ImageSegmenter`.
 *
 * Produces semantic segmentation masks (e.g., person / background for the
 * selfie segmenter). Confidence masks are returned as `Uint8Array` (0-255).
 */
export class MediaPipeImageSegmenter implements SegmentationModel {
  readonly modelId: string;
  readonly provider = 'mediapipe';
  readonly segmentationType = 'semantic' as const;

  private readonly task: LazyMediaPipeTask<ImageSegmenter>;

  constructor(
    modelId: string,
    settings: MediaPipeModelSettings = {},
    providerSettings: MediaPipeProviderSettings = {}
  ) {
    this.modelId = `mediapipe:${modelId}`;
    const modelUrl = resolveModelUrl(modelId, settings.modelPath);
    const wasmPath = resolveWasmPath('vision', providerSettings.wasmBasePath, settings.wasmBasePath);
    const delegate = settings.delegate ?? providerSettings.delegate ?? 'GPU';

    this.task = new LazyMediaPipeTask<ImageSegmenter>(async () => {
      const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(wasmPath);
      return ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
        outputCategoryMask: true,
      });
    }, this.modelId);
  }

  async doSegment(options: DoSegmentImageOptions): Promise<DoSegmentImageResult> {
    const { images, abortSignal } = options;
    abortSignal?.throwIfAborted();

    const segmenter = await this.task.get();
    abortSignal?.throwIfAborted();

    const startTime = performance.now();
    const results: SegmentationResultItem[] = [];

    try {
      for (const image of images) {
        abortSignal?.throwIfAborted();
        const source = await toImageSource(image);
        const raw = segmenter.segment(source);
        releaseImageSource(source);

        const masks: SegmentMask[] = [];

        if (raw.categoryMask) {
          masks.push({
            label: 'category',
            score: 1,
            mask: raw.categoryMask.getAsUint8Array(),
          });
        }

        if (raw.confidenceMasks) {
          raw.confidenceMasks.forEach((mpMask, i) => {
            const floats = mpMask.getAsFloat32Array();
            const bytes = new Uint8Array(floats.length);
            for (let p = 0; p < floats.length; p++) {
              bytes[p] = Math.round(Math.min(1, Math.max(0, floats[p])) * 255);
            }
            masks.push({ label: `confidence_${i}`, score: 1, mask: bytes });
          });
        }

        raw.close();
        results.push({ masks });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new VisionError(
        `Image segmentation failed: ${(error as Error)?.message ?? String(error)}`,
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
