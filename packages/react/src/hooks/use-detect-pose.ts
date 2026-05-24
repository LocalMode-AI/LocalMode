/**
 * @file use-detect-pose.ts
 * @description Hook for pose landmark detection with @localmode/core detectPose()
 */

import type { PoseLandmarkModel, DetectPoseResult, ImageInput } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useDetectPose hook */
interface UseDetectPoseOptions {
  /** The pose landmark model to use */
  model: PoseLandmarkModel;
  /** Maximum number of poses to detect (default: 1) */
  numPoses?: number;
}

/**
 * Hook for detecting body pose landmarks in an image.
 *
 * @param options - Pose landmark model configuration
 * @returns Operation state with execute(image: ImageInput) function
 */
export function useDetectPose(options: UseDetectPoseOptions) {
  const { model, numPoses } = options;

  return useOperation<[ImageInput], DetectPoseResult>({
    fn: async (image: ImageInput, signal: AbortSignal) => {
      const { detectPose } = await import('@localmode/core');
      return detectPose({ model, image, numPoses, abortSignal: signal });
    },
  });
}
