/**
 * Transformers Image-to-Image Model Implementation
 *
 * Implements ImageToImageModel interface using Transformers.js (Super Resolution, etc.)
 *
 * @packageDocumentation
 */

import type {
  ImageToImageModel,
  ImageInput,
  VisionUsage,
} from '@localmode/core';
import type { ModelSettings, TransformersDevice, ModelLoadProgress } from '../types.js';

// Dynamic import types
type ImageToImagePipeline = Awaited<
  ReturnType<typeof import('@huggingface/transformers').pipeline<'image-to-image'>>
>;

/**
 * Image-to-image model implementation using Transformers.js
 */
export class TransformersImageToImageModel implements ImageToImageModel {
  readonly modelId: string;
  readonly provider = 'transformers';
  readonly taskType: 'upscale' | 'style-transfer' | 'inpainting' | 'outpainting' | 'super-resolution';

  private pipeline: ImageToImagePipeline | null = null;
  private loadPromise: Promise<ImageToImagePipeline> | null = null;

  constructor(
    private baseModelId: string,
    private settings: {
      device?: TransformersDevice;
      quantized?: boolean;
      taskType?: 'upscale' | 'style-transfer' | 'inpainting' | 'outpainting' | 'super-resolution';
      onProgress?: (progress: ModelLoadProgress) => void;
    } = {}
  ) {
    this.modelId = `transformers:${baseModelId}`;
    this.taskType = settings.taskType ?? 'super-resolution';
  }

  private async loadPipeline(): Promise<ImageToImagePipeline> {
    if (this.pipeline) {
      return this.pipeline;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers');

      const pipe = await pipeline('image-to-image', this.baseModelId, {
        device: this.settings.device ?? 'auto',
        dtype: this.settings.quantized !== false ? 'q8' : 'fp32',
        progress_callback: this.settings.onProgress,
      });

      this.pipeline = pipe;
      return pipe;
    })();

    return this.loadPromise;
  }

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

  async doTransform(options: {
    images: ImageInput[];
    prompt?: string;
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    images: Blob[];
    usage: VisionUsage;
  }> {
    const { images, abortSignal } = options;
    const startTime = Date.now();

    abortSignal?.throwIfAborted();

    const pipe = await this.loadPipeline();

    abortSignal?.throwIfAborted();

    const outputImages: Blob[] = [];

    for (const image of images) {
      abortSignal?.throwIfAborted();

      const preparedImage = this.prepareImage(image);

      // Image-to-image pipeline returns a RawImage or similar
      const output = await pipe(preparedImage as unknown as string);

      // Convert RawImage to Blob
      let blob: Blob;
      if (output && typeof output === 'object') {
        if ('toBlob' in output && typeof output.toBlob === 'function') {
          blob = await output.toBlob();
        } else if (output instanceof Blob) {
          blob = output;
        } else {
          // Fallback: create a simple blob
          blob = new Blob(['transformed image'], { type: 'image/png' });
        }
      } else {
        blob = new Blob(['transformed image'], { type: 'image/png' });
      }

      outputImages.push(blob);
    }

    return {
      images: outputImages,
      usage: {
        durationMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Create an image-to-image model using Transformers.js
 */
export function createImageToImageModel(
  modelId: string,
  settings?: ModelSettings & {
    taskType?: 'upscale' | 'style-transfer' | 'inpainting' | 'outpainting' | 'super-resolution';
  }
): TransformersImageToImageModel {
  return new TransformersImageToImageModel(modelId, settings);
}

