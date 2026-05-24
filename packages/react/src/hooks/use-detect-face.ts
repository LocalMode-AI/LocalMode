/**
 * @file use-detect-face.ts
 * @description Hook for face detection with @localmode/core detectFace()
 */

import type { FaceDetectionModel, DetectFaceResult, ImageInput } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useDetectFace hook */
interface UseDetectFaceOptions {
  /** The face detection model to use */
  model: FaceDetectionModel;
}

/**
 * Hook for detecting faces (bounding boxes + keypoints) in an image.
 *
 * @param options - Face detection model configuration
 * @returns Operation state with execute(image: ImageInput) function
 */
export function useDetectFace(options: UseDetectFaceOptions) {
  const { model } = options;

  return useOperation<[ImageInput], DetectFaceResult>({
    fn: async (image: ImageInput, signal: AbortSignal) => {
      const { detectFace } = await import('@localmode/core');
      return detectFace({ model, image, abortSignal: signal });
    },
  });
}
