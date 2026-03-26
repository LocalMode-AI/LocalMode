/**
 * @file use-caption-image.ts
 * @description Hook for image captioning with @localmode/core captionImage()
 */

import type { ImageCaptionModel, CaptionImageResult } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useCaptionImage hook */
interface UseCaptionImageOptions {
  /** The image captioning model to use */
  model: ImageCaptionModel;
}

/**
 * Hook for image captioning.
 *
 * @param options - Image caption model configuration
 * @returns Operation state with execute(image: string) function (image as data URL)
 */
export function useCaptionImage(options: UseCaptionImageOptions) {
  const { model } = options;

  return useOperation<[string], CaptionImageResult>({
    fn: async (image: string, signal: AbortSignal) => {
      const { captionImage } = await import('@localmode/core');
      return captionImage({ model, image, abortSignal: signal });
    },
  });
}
