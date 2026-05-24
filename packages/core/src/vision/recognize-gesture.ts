/**
 * Gesture Recognition Function
 *
 * Function-first API for recognizing hand gestures in images.
 *
 * @packageDocumentation
 */

import type {
  GestureRecognitionModel,
  GestureRecognitionModelFactory,
  RecognizeGestureOptions,
  RecognizeGestureResult,
} from './types.js';

// Global provider for string model ID resolution
let globalGestureRecognitionProvider: GestureRecognitionModelFactory | null = null;

/**
 * Set the global gesture recognition provider for string model ID resolution.
 *
 * @param provider - Factory function to create gesture recognition models from string IDs
 */
export function setGlobalGestureRecognitionProvider(
  provider: GestureRecognitionModelFactory | null
): void {
  globalGestureRecognitionProvider = provider;
}

/**
 * Resolve a model from string ID or return the model object.
 */
function resolveModel(
  modelOrId: GestureRecognitionModel | string
): GestureRecognitionModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalGestureRecognitionProvider) {
    throw new Error(
      'No global gesture recognition provider configured. ' +
        'Either pass a GestureRecognitionModel object or call setGlobalGestureRecognitionProvider() first.'
    );
  }

  return globalGestureRecognitionProvider(modelOrId);
}

/**
 * Recognize hand gestures in an image.
 *
 * Detects hands and classifies each into a gesture category
 * (e.g., `Thumb_Up`, `Victory`, `Open_Palm`), returning the gesture
 * name, confidence, handedness, and hand landmarks.
 *
 * @param options - Recognition options including model and image
 * @returns Promise with recognized gestures and usage information
 *
 * @example Basic usage
 * ```ts
 * import { recognizeGesture } from '@localmode/core';
 * import { mediapipe } from '@localmode/mediapipe';
 *
 * const { gestures } = await recognizeGesture({
 *   model: mediapipe.gestureRecognizer(),
 *   image: imageBlob,
 * });
 *
 * for (const g of gestures) {
 *   console.log(`${g.gesture}: ${(g.score * 100).toFixed(1)}%`);
 * }
 * ```
 *
 * @throws {Error} If recognition fails after all retries
 * @throws {Error} If aborted via AbortSignal
 */
export async function recognizeGesture(
  options: RecognizeGestureOptions
): Promise<RecognizeGestureResult> {
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

      const result = await model.doRecognize({
        images: [image],
        numHands,
        minDetectionConfidence,
        abortSignal,
        providerOptions,
      });

      const durationMs = performance.now() - startTime;

      return {
        gestures: result.results[0],
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

  throw lastError || new Error('Gesture recognition failed');
}
