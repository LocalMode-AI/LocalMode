/**
 * Transformers Image Classification Model Implementation
 *
 * Implements ImageClassificationModel interface using Transformers.js
 *
 * @packageDocumentation
 */

import type {
  ImageClassificationModel,
  ImageClassificationResultItem,
  ImageInput,
  VisionUsage,
} from '@localmode/core';
import type { ModelSettings, TransformersDevice, ModelLoadProgress } from '../types.js';

// Dynamic import types
type ImageClassificationPipeline = Awaited<
  ReturnType<typeof import('@huggingface/transformers').pipeline<'image-classification'>>
>;

/**
 * Image classification model implementation using Transformers.js
 */
export class TransformersImageClassificationModel implements ImageClassificationModel {
  readonly modelId: string;
  readonly provider = 'transformers';

  private pipeline: ImageClassificationPipeline | null = null;
  private loadPromise: Promise<ImageClassificationPipeline> | null = null;

  constructor(
    private baseModelId: string,
    private settings: {
      device?: TransformersDevice;
      quantized?: boolean;
      onProgress?: (progress: ModelLoadProgress) => void;
    } = {}
  ) {
    this.modelId = `transformers:${baseModelId}`;
  }

  private async loadPipeline(): Promise<ImageClassificationPipeline> {
    if (this.pipeline) {
      return this.pipeline;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers');

      const pipe = await pipeline('image-classification', this.baseModelId, {
        device: this.settings.device ?? 'auto',
        dtype: this.settings.quantized !== false ? 'q8' : 'fp32',
        progress_callback: this.settings.onProgress,
      });

      this.pipeline = pipe;
      return pipe;
    })();

    return this.loadPromise;
  }

  /**
   * Convert ImageInput to a format Transformers.js can process
   */
  private prepareImage(image: ImageInput): string | Blob | ImageData {
    if (typeof image === 'string') {
      // URL or data URL
      return image;
    }
    if (image instanceof Blob) {
      return image;
    }
    if (image instanceof ImageData) {
      return image;
    }
    if (image instanceof ArrayBuffer) {
      // Convert to Blob
      return new Blob([image], { type: 'image/png' });
    }
    return image as string;
  }

  async doClassify(options: {
    images: ImageInput[];
    topK?: number;
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    results: ImageClassificationResultItem[][];
    usage: VisionUsage;
  }> {
    const { images, topK = 5, abortSignal } = options;
    const startTime = Date.now();

    abortSignal?.throwIfAborted();

    const pipe = await this.loadPipeline();

    abortSignal?.throwIfAborted();

    const results: ImageClassificationResultItem[][] = [];

    for (const image of images) {
      abortSignal?.throwIfAborted();

      const preparedImage = this.prepareImage(image);
      // Use type assertion as transformers accepts various image formats
      const output = await pipe(preparedImage as unknown as string, { top_k: topK });

      // Output is array of { label, score }
      const predictions = (Array.isArray(output) ? output : [output]) as Array<{
        label: string;
        score: number;
      }>;

      results.push(
        predictions.map((p) => ({
          label: p.label,
          score: p.score,
        }))
      );
    }

    return {
      results,
      usage: {
        durationMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Create an image classification model using Transformers.js
 */
export function createImageClassificationModel(
  modelId: string,
  settings?: ModelSettings
): TransformersImageClassificationModel {
  return new TransformersImageClassificationModel(modelId, settings);
}
