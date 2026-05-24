/**
 * @file use-recognize-gesture.ts
 * @description Hook for gesture recognition with @localmode/core recognizeGesture()
 */

import type {
  GestureRecognitionModel,
  RecognizeGestureResult,
  ImageInput,
} from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useRecognizeGesture hook */
interface UseRecognizeGestureOptions {
  /** The gesture recognition model to use */
  model: GestureRecognitionModel;
  /** Maximum number of hands to detect (default: 2) */
  numHands?: number;
}

/**
 * Hook for recognizing hand gestures in an image.
 *
 * @param options - Gesture recognition model configuration
 * @returns Operation state with execute(image: ImageInput) function
 */
export function useRecognizeGesture(options: UseRecognizeGestureOptions) {
  const { model, numHands } = options;

  return useOperation<[ImageInput], RecognizeGestureResult>({
    fn: async (image: ImageInput, signal: AbortSignal) => {
      const { recognizeGesture } = await import('@localmode/core');
      return recognizeGesture({ model, image, numHands, abortSignal: signal });
    },
  });
}
