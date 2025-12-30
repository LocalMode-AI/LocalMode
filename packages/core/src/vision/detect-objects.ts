/**
 * Object Detection Function
 *
 * Function-first API for object detection in images.
 *
 * @packageDocumentation
 */

import type {
  ObjectDetectionModel,
  DetectObjectsOptions,
  DetectObjectsResult,
  ObjectDetectionModelFactory,
} from './types.js';

// Global provider for string model ID resolution
let globalObjectDetectionProvider: ObjectDetectionModelFactory | null = null;

/**
 * Set the global object detection provider for string model ID resolution.
 *
 * @param provider - Factory function to create object detection models from string IDs
 */
export function setGlobalObjectDetectionProvider(
  provider: ObjectDetectionModelFactory | null
): void {
  globalObjectDetectionProvider = provider;
}

/**
 * Resolve a model from string ID or return the model object.
 */
function resolveModel(modelOrId: ObjectDetectionModel | string): ObjectDetectionModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalObjectDetectionProvider) {
    throw new Error(
      'No global object detection provider configured. ' +
        'Either pass an ObjectDetectionModel object or call setGlobalObjectDetectionProvider() first.'
    );
  }

  return globalObjectDetectionProvider(modelOrId);
}

/**
 * Detect objects in an image.
 *
 * @param options - Detection options including model and image
 * @returns Promise with detected objects and usage information
 *
 * @example Basic usage
 * ```ts
 * import { detectObjects } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { objects, usage } = await detectObjects({
 *   model: transformers.objectDetector('Xenova/detr-resnet-50'),
 *   image: imageBlob,
 *   threshold: 0.7,
 * });
 *
 * for (const obj of objects) {
 *   console.log(`${obj.label} at (${obj.box.x}, ${obj.box.y}): ${(obj.score * 100).toFixed(1)}%`);
 * }
 * ```
 *
 * @example Custom threshold
 * ```ts
 * const { objects } = await detectObjects({
 *   model: transformers.objectDetector('Xenova/yolos-tiny'),
 *   image: sceneImage,
 *   threshold: 0.3, // Lower threshold for more detections
 * });
 * ```
 *
 * @throws {Error} If detection fails
 */
export async function detectObjects(options: DetectObjectsOptions): Promise<DetectObjectsResult> {
  const {
    model: modelOrId,
    image,
    threshold = 0.5,
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
        threshold,
        abortSignal,
        providerOptions,
      });

      const durationMs = performance.now() - startTime;

      return {
        objects: result.results[0].objects,
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

  throw lastError || new Error('Object detection failed');
}

