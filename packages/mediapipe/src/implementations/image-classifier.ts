/**
 * MediaPipe Image Classifier
 *
 * Implements the core `ImageClassificationModel` interface using
 * `@mediapipe/tasks-vision`'s `ImageClassifier` task.
 *
 * @packageDocumentation
 */

import type {
  ImageClassificationModel,
  DoClassifyImageOptions,
  DoClassifyImageResult,
  ImageClassificationResultItem,
} from '@localmode/core';
import { VisionError } from '@localmode/core';
import type { ImageClassifier } from '@mediapipe/tasks-vision';
import type { MediaPipeModelSettings, MediaPipeProviderSettings } from '../types.js';
import { resolveModelUrl } from '../models.js';
import { resolveWasmPath, toImageSource, releaseImageSource } from '../utils.js';
import { LazyMediaPipeTask } from './base.js';

/**
 * Image classification model backed by MediaPipe's `ImageClassifier`.
 */
export class MediaPipeImageClassifier implements ImageClassificationModel {
  readonly modelId: string;
  readonly provider = 'mediapipe';

  private readonly task: LazyMediaPipeTask<ImageClassifier>;

  constructor(
    modelId: string,
    settings: MediaPipeModelSettings = {},
    providerSettings: MediaPipeProviderSettings = {}
  ) {
    this.modelId = `mediapipe:${modelId}`;
    const modelUrl = resolveModelUrl(modelId, settings.modelPath);
    const wasmPath = resolveWasmPath('vision', providerSettings.wasmBasePath, settings.wasmBasePath);
    const delegate = settings.delegate ?? providerSettings.delegate ?? 'GPU';

    this.task = new LazyMediaPipeTask<ImageClassifier>(async () => {
      const { FilesetResolver, ImageClassifier } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(wasmPath);
      return ImageClassifier.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: 'IMAGE',
      });
    }, this.modelId);
  }

  async doClassify(options: DoClassifyImageOptions): Promise<DoClassifyImageResult> {
    const { images, topK, abortSignal } = options;
    abortSignal?.throwIfAborted();

    const classifier = await this.task.get();
    abortSignal?.throwIfAborted();
    if (topK !== undefined) {
      classifier.setOptions({ maxResults: topK });
    }

    const startTime = performance.now();
    const results: ImageClassificationResultItem[][] = [];

    try {
      for (const image of images) {
        abortSignal?.throwIfAborted();
        const source = await toImageSource(image);
        const raw = classifier.classify(source);
        releaseImageSource(source);

        const categories = raw.classifications[0]?.categories ?? [];
        results.push(
          categories.map((c) => ({
            label: c.categoryName || c.displayName || `class_${c.index}`,
            score: c.score,
          }))
        );
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new VisionError(
        `Image classification failed: ${(error as Error)?.message ?? String(error)}`,
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
