/**
 * Pose Landmark Detection Function
 *
 * Function-first API for detecting body pose landmarks in images.
 *
 * @packageDocumentation
 */

import type {
  PoseLandmarkModel,
  PoseLandmarkModelFactory,
  DetectPoseOptions,
  DetectPoseResult,
} from './types.js';

// Global provider for string model ID resolution
let globalPoseLandmarkProvider: PoseLandmarkModelFactory | null = null;

/**
 * Set the global pose landmark provider for string model ID resolution.
 *
 * @param provider - Factory function to create pose landmark models from string IDs
 */
export function setGlobalPoseLandmarkProvider(
  provider: PoseLandmarkModelFactory | null
): void {
  globalPoseLandmarkProvider = provider;
}

/**
 * Resolve a model from string ID or return the model object.
 */
function resolveModel(modelOrId: PoseLandmarkModel | string): PoseLandmarkModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalPoseLandmarkProvider) {
    throw new Error(
      'No global pose landmark provider configured. ' +
        'Either pass a PoseLandmarkModel object or call setGlobalPoseLandmarkProvider() first.'
    );
  }

  return globalPoseLandmarkProvider(modelOrId);
}

/**
 * Detect body pose landmarks in an image.
 *
 * Detects up to `numPoses` people and returns 33 landmarks per pose
 * covering the body, arms, legs, and face anchor points.
 *
 * @param options - Detection options including model and image
 * @returns Promise with detected poses and usage information
 *
 * @example Basic usage
 * ```ts
 * import { detectPose } from '@localmode/core';
 * import { mediapipe } from '@localmode/mediapipe';
 *
 * const { poses } = await detectPose({
 *   model: mediapipe.poseLandmarker(),
 *   image: imageBlob,
 * });
 *
 * console.log(`Detected ${poses.length} pose(s)`);
 * ```
 *
 * @throws {Error} If detection fails after all retries
 * @throws {Error} If aborted via AbortSignal
 */
export async function detectPose(options: DetectPoseOptions): Promise<DetectPoseResult> {
  const {
    model: modelOrId,
    image,
    numPoses = 1,
    minDetectionConfidence = 0.5,
    abortSignal,
    maxRetries = 2,
    providerOptions,
  } = options;

  abortSignal?.throwIfAborted();

  const model = resolveModel(modelOrId);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    abortSignal?.throwIfAborted();

    try {
      const startTime = performance.now();

      const result = await model.doDetect({
        images: [image],
        numPoses,
        minDetectionConfidence,
        abortSignal,
        providerOptions,
      });

      const durationMs = performance.now() - startTime;

      return {
        poses: result.results[0],
        usage: {
          ...result.usage,
          durationMs,
        },
        response: {
          modelId: model.modelId,
          timestamp: new Date(),
        },
      };
    } catch (error) {
      lastError = error as Error;

      if (abortSignal?.aborted) {
        throw error;
      }

      if (attempt === maxRetries) {
        throw error;
      }

      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Pose detection failed');
}
