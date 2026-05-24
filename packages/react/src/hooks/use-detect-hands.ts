/**
 * @file use-detect-hands.ts
 * @description Hook for hand landmark detection with @localmode/core detectHands()
 */

import type { HandLandmarkModel, DetectHandsResult, ImageInput } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useDetectHands hook */
interface UseDetectHandsOptions {
  /** The hand landmark model to use */
  model: HandLandmarkModel;
  /** Maximum number of hands to detect (default: 2) */
  numHands?: number;
}

/**
 * Hook for detecting hand landmarks in an image.
 *
 * @param options - Hand landmark model configuration
 * @returns Operation state with execute(image: ImageInput) function
 */
export function useDetectHands(options: UseDetectHandsOptions) {
  const { model, numHands } = options;

  return useOperation<[ImageInput], DetectHandsResult>({
    fn: async (image: ImageInput, signal: AbortSignal) => {
      const { detectHands } = await import('@localmode/core');
      return detectHands({ model, image, numHands, abortSignal: signal });
    },
  });
}
