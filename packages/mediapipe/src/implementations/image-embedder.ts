/**
 * MediaPipe Image Embedder
 *
 * Implements the core `ImageFeatureModel` interface using
 * `@mediapipe/tasks-vision`'s `ImageEmbedder` task.
 *
 * @packageDocumentation
 */

import type {
  ImageFeatureModel,
  DoExtractImageFeaturesOptions,
  DoExtractImageFeaturesResult,
} from '@localmode/core';
import { VisionError } from '@localmode/core';
import type { ImageEmbedder } from '@mediapipe/tasks-vision';
import type { MediaPipeModelSettings, MediaPipeProviderSettings } from '../types.js';
import { resolveModelUrl } from '../models.js';
import { resolveWasmPath, toImageSource, releaseImageSource } from '../utils.js';
import { LazyMediaPipeTask } from './base.js';

/** Default embedding dimension for the MobileNet-V3 Small image embedder. */
const DEFAULT_DIMENSIONS = 1024;

/**
 * Image embedding model backed by MediaPipe's `ImageEmbedder`.
 */
export class MediaPipeImageEmbedder implements ImageFeatureModel {
  readonly modelId: string;
  readonly provider = 'mediapipe';
  readonly dimensions: number;

  private readonly task: LazyMediaPipeTask<ImageEmbedder>;

  constructor(
    modelId: string,
    settings: MediaPipeModelSettings = {},
    providerSettings: MediaPipeProviderSettings = {}
  ) {
    this.modelId = `mediapipe:${modelId}`;
    this.dimensions = DEFAULT_DIMENSIONS;
    const modelUrl = resolveModelUrl(modelId, settings.modelPath);
    const wasmPath = resolveWasmPath('vision', providerSettings.wasmBasePath, settings.wasmBasePath);
    const delegate = settings.delegate ?? providerSettings.delegate ?? 'GPU';

    this.task = new LazyMediaPipeTask<ImageEmbedder>(async () => {
      const { FilesetResolver, ImageEmbedder } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(wasmPath);
      return ImageEmbedder.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: 'IMAGE',
      });
    }, this.modelId);
  }

  async doExtract(
    options: DoExtractImageFeaturesOptions
  ): Promise<DoExtractImageFeaturesResult> {
    const { images, abortSignal } = options;
    abortSignal?.throwIfAborted();

    const embedder = await this.task.get();
    abortSignal?.throwIfAborted();

    const startTime = performance.now();
    const features: Float32Array[] = [];

    try {
      for (const image of images) {
        abortSignal?.throwIfAborted();
        const source = await toImageSource(image);
        const raw = embedder.embed(source);
        releaseImageSource(source);

        const floatEmbedding = raw.embeddings[0]?.floatEmbedding ?? [];
        features.push(Float32Array.from(floatEmbedding));
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new VisionError(
        `Image feature extraction failed: ${(error as Error)?.message ?? String(error)}`,
        {
          hint: 'Ensure the image is a valid Blob, ImageData, ArrayBuffer, or URL.',
          cause: error instanceof Error ? error : undefined,
        }
      );
    }

    return {
      features,
      usage: { durationMs: performance.now() - startTime },
    };
  }

  /** Dispose the underlying MediaPipe task and free WASM resources. */
  close(): void {
    this.task.close();
  }
}
