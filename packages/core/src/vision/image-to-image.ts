/**
 * Image-to-Image Transformation Function
 *
 * Function-first API for image transformation (super resolution, etc.).
 *
 * @packageDocumentation
 */

import type {
  ImageToImageModel,
  UpscaleImageOptions,
  UpscaleImageResult,
  ImageToImageModelFactory,
} from './types.js';

// Global provider for string model ID resolution
let globalImageToImageProvider: ImageToImageModelFactory | null = null;

/**
 * Set the global image-to-image provider for string model ID resolution.
 *
 * @param provider - Factory function to create image-to-image models from string IDs
 */
export function setGlobalImageToImageProvider(provider: ImageToImageModelFactory | null): void {
  globalImageToImageProvider = provider;
}

/**
 * Resolve a model from string ID or return the model object.
 */
function resolveModel(modelOrId: ImageToImageModel | string): ImageToImageModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalImageToImageProvider) {
    throw new Error(
      'No global image-to-image provider configured. ' +
        'Either pass an ImageToImageModel object or call setGlobalImageToImageProvider() first.'
    );
  }

  return globalImageToImageProvider(modelOrId);
}

/**
 * Upscale an image using super resolution.
 *
 * @param options - Upscale options including model, image, and scale factor
 * @returns Promise with upscaled image and usage information
 *
 * @example Basic usage
 * ```ts
 * import { upscaleImage } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { image, usage } = await upscaleImage({
 *   model: transformers.imageToImage('Xenova/swin2SR-classical-sr-x2-64'),
 *   image: lowResImage,
 *   scale: 2,
 * });
 *
 * console.log(`Upscaled in ${usage.durationMs}ms`);
 * ```
 *
 * @example 4x upscaling
 * ```ts
 * const { image } = await upscaleImage({
 *   model: transformers.imageToImage('Xenova/swin2SR-realworld-sr-x4-64'),
 *   image: thumbnailImage,
 *   scale: 4,
 * });
 * ```
 *
 * @throws {Error} If upscaling fails
 */
export async function upscaleImage(options: UpscaleImageOptions): Promise<UpscaleImageResult> {
  const {
    model: modelOrId,
    image,
    scale = 2,
    abortSignal,
    maxRetries = 2,
    providerOptions,
  } = options;

  abortSignal?.throwIfAborted();

  const model = resolveModel(modelOrId);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    abortSignal?.throwIfAborted();

    try {
      const startTime = performance.now();

      const result = await model.doTransform({
        images: [image],
        scale,
        abortSignal,
        providerOptions,
      });

      const durationMs = performance.now() - startTime;

      return {
        image: result.images[0],
        usage: {
          ...result.usage,
          durationMs,
        },
        response: {
          modelId: model.modelId,
          timestamp: new Date(),
        },
      };
    } catch (error) {
      lastError = error as Error;

      if (abortSignal?.aborted) {
        throw error;
      }

      if (attempt === maxRetries) {
        throw error;
      }

      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Image upscaling failed');
}

/**
 * Alias for upscaleImage - transform an image using image-to-image models.
 *
 * @see {@link upscaleImage}
 */
export const imageToImage = upscaleImage;
