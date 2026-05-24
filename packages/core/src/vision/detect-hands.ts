/**
 * Hand Landmark Detection Function
 *
 * Function-first API for detecting hand landmarks in images.
 *
 * @packageDocumentation
 */

import type {
  HandLandmarkModel,
  HandLandmarkModelFactory,
  DetectHandsOptions,
  DetectHandsResult,
} from './types.js';

// Global provider for string model ID resolution
let globalHandLandmarkProvider: HandLandmarkModelFactory | null = null;

/**
 * Set the global hand landmark provider for string model ID resolution.
 *
 * @param provider - Factory function to create hand landmark models from string IDs
 */
export function setGlobalHandLandmarkProvider(
  provider: HandLandmarkModelFactory | null
): void {
  globalHandLandmarkProvider = provider;
}

/**
 * Resolve a model from string ID or return the model object.
 */
function resolveModel(modelOrId: HandLandmarkModel | string): HandLandmarkModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalHandLandmarkProvider) {
    throw new Error(
      'No global hand landmark provider configured. ' +
        'Either pass a HandLandmarkModel object or call setGlobalHandLandmarkProvider() first.'
    );
  }

  return globalHandLandmarkProvider(modelOrId);
}

/**
 * Detect hand landmarks in an image.
 *
 * Detects up to `numHands` hands and returns 21 landmarks per hand,
 * handedness, and a confidence score.
 *
 * @param options - Detection options including model and image
 * @returns Promise with detected hands and usage information
 *
 * @example Basic usage
 * ```ts
 * import { detectHands } from '@localmode/core';
 * import { mediapipe } from '@localmode/mediapipe';
 *
 * const { hands } = await detectHands({
 *   model: mediapipe.handLandmarker(),
 *   image: imageBlob,
 *   numHands: 2,
 * });
 *
 * for (const hand of hands) {
 *   console.log(`${hand.handedness} hand: ${hand.landmarks.length} landmarks`);
 * }
 * ```
 *
 * @throws {Error} If detection fails after all retries
 * @throws {Error} If aborted via AbortSignal
 */
export async function detectHands(options: DetectHandsOptions): Promise<DetectHandsResult> {
  const {
    model: modelOrId,
    image,
    numHands = 2,
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
        numHands,
        minDetectionConfidence,
        abortSignal,
        providerOptions,
      });

      const durationMs = performance.now() - startTime;

      return {
        hands: result.results[0],
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

  throw lastError || new Error('Hand detection failed');
}
