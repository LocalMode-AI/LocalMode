/**
 * @file use-segment-image.ts
 * @description Hook for image segmentation with @localmode/core segmentImage()
 */

import type { SegmentationModel, SegmentImageResult } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useSegmentImage hook */
interface UseSegmentImageOptions {
  /** The segmentation model to use */
  model: SegmentationModel;
}

/**
 * Hook for image segmentation.
 *
 * @param options - Segmentation model configuration
 * @returns Operation state with execute(image: string) function (image as data URL)
 */
export function useSegmentImage(options: UseSegmentImageOptions) {
  const { model } = options;

  return useOperation<[string], SegmentImageResult>({
    fn: async (image: string, signal: AbortSignal) => {
      const { segmentImage } = await import('@localmode/core');
      return segmentImage({ model, image, abortSignal: signal });
    },
  });
}
