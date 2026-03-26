/**
 * @file use-extract-image-features.ts
 * @description Hook for image feature extraction with @localmode/core extractImageFeatures()
 */

import type { ImageFeatureModel, ExtractImageFeaturesResult } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useExtractImageFeatures hook */
interface UseExtractImageFeaturesOptions {
  /** The image feature model to use */
  model: ImageFeatureModel;
}

/**
 * Hook for extracting feature vectors from images (e.g., CLIP embeddings).
 *
 * @param options - Image feature model configuration
 * @returns Operation state with execute(image: string) function (image as data URL)
 */
export function useExtractImageFeatures(options: UseExtractImageFeaturesOptions) {
  const { model } = options;

  return useOperation<[string], ExtractImageFeaturesResult>({
    fn: async (image: string, signal: AbortSignal) => {
      const { extractImageFeatures } = await import('@localmode/core');
      return extractImageFeatures({ model, image, abortSignal: signal });
    },
  });
}
