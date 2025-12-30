/**
 * Transformers Image Captioning Model Implementation
 *
 * Implements ImageCaptionModel interface using Transformers.js (BLIP)
 *
 * @packageDocumentation
 */

import type { ImageCaptionModel, ImageInput, VisionUsage } from '@localmode/core';
import type { ModelSettings, TransformersDevice, ModelLoadProgress } from '../types.js';

// Dynamic import types
type ImageToTextPipeline = Awaited<
  ReturnType<typeof import('@huggingface/transformers').pipeline<'image-to-text'>>
>;

/**
 * Image captioning model implementation using Transformers.js (BLIP)
 */
export class TransformersCaptionModel implements ImageCaptionModel {
  readonly modelId: string;
  readonly provider = 'transformers';

  private pipeline: ImageToTextPipeline | null = null;
  private loadPromise: Promise<ImageToTextPipeline> | null = null;

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

  private async loadPipeline(): Promise<ImageToTextPipeline> {
    if (this.pipeline) {
      return this.pipeline;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers');

      const pipe = await pipeline('image-to-text', this.baseModelId, {
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

  async doCaption(options: {
    images: ImageInput[];
    maxLength?: number;
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    captions: string[];
    usage: VisionUsage;
  }> {
    const { images, maxLength, abortSignal } = options;
    const startTime = Date.now();

    abortSignal?.throwIfAborted();

    const pipe = await this.loadPipeline();

    abortSignal?.throwIfAborted();

    const captions: string[] = [];

    for (const image of images) {
      abortSignal?.throwIfAborted();

      const preparedImage = this.prepareImage(image);

      const pipelineOptions: Record<string, unknown> = {};
      if (maxLength) {
        pipelineOptions.max_length = maxLength;
      }

      // Use type assertion as transformers accepts various image formats
      const output = await pipe(preparedImage as unknown as string, pipelineOptions);

      // Output is array of { generated_text: string }
      const results = Array.isArray(output) ? output : [output];
      const caption = (results[0] as { generated_text: string }).generated_text;

      captions.push(caption.trim());
    }

    return {
      captions,
      usage: {
        durationMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Create an image captioning model using Transformers.js
 */
export function createCaptionModel(
  modelId: string,
  settings?: ModelSettings
): TransformersCaptionModel {
  return new TransformersCaptionModel(modelId, settings);
}
