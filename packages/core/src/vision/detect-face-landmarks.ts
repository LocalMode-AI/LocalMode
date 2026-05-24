/**
 * Face Landmark Detection Function
 *
 * Function-first API for detecting 478-point face mesh landmarks in images.
 *
 * @packageDocumentation
 */

import type {
  FaceLandmarkModel,
  FaceLandmarkModelFactory,
  DetectFaceLandmarksOptions,
  DetectFaceLandmarksResult,
} from './types.js';

// Global provider for string model ID resolution
let globalFaceLandmarkProvider: FaceLandmarkModelFactory | null = null;

/**
 * Set the global face landmark provider for string model ID resolution.
 *
 * @param provider - Factory function to create face landmark models from string IDs
 */
export function setGlobalFaceLandmarkProvider(
  provider: FaceLandmarkModelFactory | null
): void {
  globalFaceLandmarkProvider = provider;
}

/**
 * Resolve a model from string ID or return the model object.
 */
function resolveModel(modelOrId: FaceLandmarkModel | string): FaceLandmarkModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalFaceLandmarkProvider) {
    throw new Error(
      'No global face landmark provider configured. ' +
        'Either pass a FaceLandmarkModel object or call setGlobalFaceLandmarkProvider() first.'
    );
  }

  return globalFaceLandmarkProvider(modelOrId);
}

/**
 * Detect face mesh landmarks in an image.
 *
 * Returns 478 face mesh landmarks per detected face, and optionally
 * facial expression blendshapes when `outputBlendshapes` is enabled.
 *
 * @param options - Detection options including model and image
 * @returns Promise with detected face landmarks and usage information
 *
 * @example Basic usage
 * ```ts
 * import { detectFaceLandmarks } from '@localmode/core';
 * import { mediapipe } from '@localmode/mediapipe';
 *
 * const { faces } = await detectFaceLandmarks({
 *   model: mediapipe.faceLandmarker(),
 *   image: imageBlob,
 *   outputBlendshapes: true,
 * });
 *
 * console.log(`Face mesh: ${faces[0]?.landmarks.length} landmarks`);
 * ```
 *
 * @throws {Error} If detection fails after all retries
 * @throws {Error} If aborted via AbortSignal
 */
export async function detectFaceLandmarks(
  options: DetectFaceLandmarksOptions
): Promise<DetectFaceLandmarksResult> {
  const {
    model: modelOrId,
    image,
    numFaces = 1,
    outputBlendshapes = false,
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
        numFaces,
        outputBlendshapes,
        minDetectionConfidence,
        abortSignal,
        providerOptions,
      });

      const durationMs = performance.now() - startTime;

      return {
        faces: result.results[0],
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

  throw lastError || new Error('Face landmark detection failed');
}
