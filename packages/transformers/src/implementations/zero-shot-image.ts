/**
 * Transformers Zero-Shot Image Classification Model Implementation
 *
 * Implements ZeroShotImageClassificationModel interface using Transformers.js (CLIP)
 *
 * @packageDocumentation
 */

import type {
  ZeroShotImageClassificationModel,
  ZeroShotImageClassificationResultItem,
  ImageInput,
  VisionUsage,
} from '@localmode/core';
import type { ModelSettings, TransformersDevice, ModelLoadProgress } from '../types.js';

// Dynamic import types
type ZeroShotImageClassificationPipeline = Awaited<
  ReturnType<typeof import('@huggingface/transformers').pipeline<'zero-shot-image-classification'>>
>;

/**
 * Zero-shot image classification model implementation using Transformers.js (CLIP)
 */
export class TransformersZeroShotImageModel implements ZeroShotImageClassificationModel {
  readonly modelId: string;
  readonly provider = 'transformers';

  private pipeline: ZeroShotImageClassificationPipeline | null = null;
  private loadPromise: Promise<ZeroShotImageClassificationPipeline> | null = null;

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

  private async loadPipeline(): Promise<ZeroShotImageClassificationPipeline> {
    if (this.pipeline) {
      return this.pipeline;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers');

      const pipe = await pipeline('zero-shot-image-classification', this.baseModelId, {
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
      return image;
    }
    if (image instanceof Blob) {
      return image;
    }
    if (image instanceof ImageData) {
      return image;
    }
    if (image instanceof ArrayBuffer) {
      return new Blob([image], { type: 'image/png' });
    }
    return image as string;
  }

  async doClassifyZeroShot(options: {
    images: ImageInput[];
    candidateLabels: string[];
    hypothesisTemplate?: string;
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    results: ZeroShotImageClassificationResultItem[];
    usage: VisionUsage;
  }> {
    const { images, candidateLabels, hypothesisTemplate, abortSignal } = options;
    const startTime = Date.now();

    abortSignal?.throwIfAborted();

    const pipe = await this.loadPipeline();

    abortSignal?.throwIfAborted();

    const results: ZeroShotImageClassificationResultItem[] = [];

    for (const image of images) {
      abortSignal?.throwIfAborted();

      const preparedImage = this.prepareImage(image);

      const pipelineOptions: Record<string, unknown> = {};
      if (hypothesisTemplate) {
        pipelineOptions.hypothesis_template = hypothesisTemplate;
      }

      // Use type assertion as transformers accepts various image formats
      const output = await pipe(
        preparedImage as unknown as string,
        candidateLabels,
        pipelineOptions
      );

      // Output is array of { label, score } sorted by score descending
      const predictions = (Array.isArray(output) ? output : [output]) as Array<{
        label: string;
        score: number;
      }>;

      // Sort by score descending and extract labels/scores
      const sorted = [...predictions].sort((a, b) => b.score - a.score);

      results.push({
        labels: sorted.map((p) => p.label),
        scores: sorted.map((p) => p.score),
      });
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
 * Create a zero-shot image classification model using Transformers.js
 */
export function createZeroShotImageModel(
  modelId: string,
  settings?: ModelSettings
): TransformersZeroShotImageModel {
  return new TransformersZeroShotImageModel(modelId, settings);
}
