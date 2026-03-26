/**
 * @file use-image-to-image.ts
 * @description Hook for image-to-image transformation with @localmode/core imageToImage()/upscaleImage()
 */

import type { ImageToImageModel, UpscaleImageResult } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useImageToImage hook */
interface UseImageToImageOptions {
  /** The image-to-image model to use */
  model: ImageToImageModel;
  /** Scale factor for upscaling (default: 2) */
  scale?: number;
}

/**
 * Hook for image-to-image transformation (upscaling, super-resolution).
 *
 * @param options - Image-to-image model configuration
 * @returns Operation state with execute(image: string) function (image as data URL)
 */
export function useImageToImage(options: UseImageToImageOptions) {
  const { model, scale } = options;

  return useOperation<[string], UpscaleImageResult>({
    fn: async (image: string, signal: AbortSignal) => {
      const { imageToImage } = await import('@localmode/core');
      return imageToImage({ model, image, scale, abortSignal: signal });
    },
  });
}
