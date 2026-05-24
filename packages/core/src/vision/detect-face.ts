/**
 * Face Detection Function
 *
 * Function-first API for detecting faces (bounding boxes + keypoints) in images.
 *
 * @packageDocumentation
 */

import type {
  FaceDetectionModel,
  FaceDetectionModelFactory,
  DetectFaceOptions,
  DetectFaceResult,
} from './types.js';

// Global provider for string model ID resolution
let globalFaceDetectionProvider: FaceDetectionModelFactory | null = null;

/**
 * Set the global face detection provider for string model ID resolution.
 *
 * @param provider - Factory function to create face detection models from string IDs
 */
export function setGlobalFaceDetectionProvider(
  provider: FaceDetectionModelFactory | null
): void {
  globalFaceDetectionProvider = provider;
}

/**
 * Resolve a model from string ID or return the model object.
 */
function resolveModel(modelOrId: FaceDetectionModel | string): FaceDetectionModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalFaceDetectionProvider) {
    throw new Error(
      'No global face detection provider configured. ' +
        'Either pass a FaceDetectionModel object or call setGlobalFaceDetectionProvider() first.'
    );
  }

  return globalFaceDetectionProvider(modelOrId);
}

/**
 * Detect faces in an image.
 *
 * Returns a bounding box, confidence score, and key facial points
 * (eyes, nose, mouth, ears) for each detected face.
 *
 * @param options - Detection options including model and image
 * @returns Promise with detected faces and usage information
 *
 * @example Basic usage
 * ```ts
 * import { detectFace } from '@localmode/core';
 * import { mediapipe } from '@localmode/mediapipe';
 *
 * const { faces } = await detectFace({
 *   model: mediapipe.faceDetector(),
 *   image: imageBlob,
 * });
 *
 * console.log(`Detected ${faces.length} face(s)`);
 * ```
 *
 * @throws {Error} If detection fails after all retries
 * @throws {Error} If aborted via AbortSignal
 */
export async function detectFace(options: DetectFaceOptions): Promise<DetectFaceResult> {
  const {
    model: modelOrId,
    image,
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

  throw lastError || new Error('Face detection failed');
}
