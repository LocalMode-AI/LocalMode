/**
 * @file use-detect-objects.ts
 * @description Hook for object detection with @localmode/core detectObjects()
 */

import type { ObjectDetectionModel, DetectObjectsResult } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useDetectObjects hook */
interface UseDetectObjectsOptions {
  /** The object detection model to use */
  model: ObjectDetectionModel;
}

/**
 * Hook for object detection in images.
 *
 * @param options - Object detection model configuration
 * @returns Operation state with execute(image: string) function (image as data URL)
 */
export function useDetectObjects(options: UseDetectObjectsOptions) {
  const { model } = options;

  return useOperation<[string], DetectObjectsResult>({
    fn: async (image: string, signal: AbortSignal) => {
      const { detectObjects } = await import('@localmode/core');
      return detectObjects({ model, image, abortSignal: signal });
    },
  });
}
