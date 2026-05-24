/**
 * @file use-detect-face-landmarks.ts
 * @description Hook for face mesh detection with @localmode/core detectFaceLandmarks()
 */

import type {
  FaceLandmarkModel,
  DetectFaceLandmarksResult,
  ImageInput,
} from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useDetectFaceLandmarks hook */
interface UseDetectFaceLandmarksOptions {
  /** The face landmark model to use */
  model: FaceLandmarkModel;
  /** Maximum number of faces to detect (default: 1) */
  numFaces?: number;
  /** Whether to output facial expression blendshapes */
  outputBlendshapes?: boolean;
}

/**
 * Hook for detecting 478-point face mesh landmarks in an image.
 *
 * @param options - Face landmark model configuration
 * @returns Operation state with execute(image: ImageInput) function
 */
export function useDetectFaceLandmarks(options: UseDetectFaceLandmarksOptions) {
  const { model, numFaces, outputBlendshapes } = options;

  return useOperation<[ImageInput], DetectFaceLandmarksResult>({
    fn: async (image: ImageInput, signal: AbortSignal) => {
      const { detectFaceLandmarks } = await import('@localmode/core');
      return detectFaceLandmarks({
        model,
        image,
        numFaces,
        outputBlendshapes,
        abortSignal: signal,
      });
    },
  });
}
