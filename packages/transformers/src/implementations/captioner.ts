/**
 * Transformers Image Captioning Model Implementation
 *
 * Implements ImageCaptionModel interface using Transformers.js (BLIP)
 *
 * @packageDocumentation
 */

import type { ImageCaptionModel, ImageInput, VisionUsage } from '@localmode/core';
import type { ModelSettings, TransformersDevice, ModelLoadProgress } from '../types.js';

// Use a generic callable type since we may use 'image-to-text' or 'image-text-to-text' pipeline
// depending on the model architecture (BLIP vs Florence-2)
type CaptionPipeline = (image: unknown, ...args: unknown[]) => Promise<unknown>;

/**
 * Image captioning model implementation using Transformers.js (BLIP, Florence-2)
 */
export class TransformersCaptionModel implements ImageCaptionModel {
  readonly modelId: string;
  readonly provider = 'transformers';

  private pipeline: CaptionPipeline | null = null;
  private loadPromise: Promise<CaptionPipeline> | null = null;

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

  private async loadPipeline(): Promise<CaptionPipeline> {
    if (this.pipeline) {
      return this.pipeline;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');

      // Suppress ONNX runtime warnings about node execution providers
      env.backends.onnx.logLevel = 'error';

      // Florence-2 and similar models use 'image-text-to-text' pipeline
      // while traditional models (BLIP, ViT-GPT2) use 'image-to-text'
      const isFlorence = this.baseModelId.toLowerCase().includes('florence');
      const task = isFlorence ? 'image-text-to-text' : 'image-to-text';

      const pipe = await (pipeline as Function)(task, this.baseModelId, {
        device: this.settings.device ?? 'auto',
        dtype: this.settings.quantized === true ? 'q8' : undefined,
        progress_callback: this.settings.onProgress,
      }) as CaptionPipeline;

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

      let caption: string;

      if (this.baseModelId.toLowerCase().includes('florence')) {
        // Florence-2 uses a text prompt to specify the task
        const output = await pipe(preparedImage as unknown as string, '<MORE_DETAILED_CAPTION>');
        const results = Array.isArray(output) ? output : [output];
        const generated = (results[0] as { generated_text: string }).generated_text;
        caption = generated.replace(/<[^>]+>/g, '').trim();
      } else {
        const output = await pipe(preparedImage as unknown as string, pipelineOptions);
        const results = Array.isArray(output) ? output : [output];
        caption = (results[0] as { generated_text: string }).generated_text;
      }

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
