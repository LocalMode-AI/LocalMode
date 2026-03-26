/**
 * @file use-classify-image.ts
 * @description Hook for image classification with @localmode/core classifyImage()
 */

import type { ImageClassificationModel, ClassifyImageResult } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useClassifyImage hook */
interface UseClassifyImageOptions {
  /** The image classification model to use */
  model: ImageClassificationModel;
}

/**
 * Hook for image classification.
 *
 * @param options - Image classification model configuration
 * @returns Operation state with execute(image: string) function (image as data URL)
 */
export function useClassifyImage(options: UseClassifyImageOptions) {
  const { model } = options;

  return useOperation<[string], ClassifyImageResult>({
    fn: async (image: string, signal: AbortSignal) => {
      const { classifyImage } = await import('@localmode/core');
      return classifyImage({ model, image, abortSignal: signal });
    },
  });
}
