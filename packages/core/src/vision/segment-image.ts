/**
 * Image Segmentation Function
 *
 * Function-first API for image segmentation.
 *
 * @packageDocumentation
 */

import type {
  SegmentationModel,
  SegmentImageOptions,
  SegmentImageResult,
  SegmentationModelFactory,
} from './types.js';

// Global provider for string model ID resolution
let globalSegmentationProvider: SegmentationModelFactory | null = null;

/**
 * Set the global segmentation provider for string model ID resolution.
 *
 * @param provider - Factory function to create segmentation models from string IDs
 */
export function setGlobalSegmentationProvider(provider: SegmentationModelFactory | null): void {
  globalSegmentationProvider = provider;
}

/**
 * Resolve a model from string ID or return the model object.
 */
function resolveModel(modelOrId: SegmentationModel | string): SegmentationModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalSegmentationProvider) {
    throw new Error(
      'No global segmentation provider configured. ' +
        'Either pass a SegmentationModel object or call setGlobalSegmentationProvider() first.'
    );
  }

  return globalSegmentationProvider(modelOrId);
}

/**
 * Segment an image into regions.
 *
 * @param options - Segmentation options including model and image
 * @returns Promise with segmentation masks and usage information
 *
 * @example Basic usage
 * ```ts
 * import { segmentImage } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { masks, usage } = await segmentImage({
 *   model: transformers.segmenter('Xenova/segformer-b0-finetuned-ade-512-512'),
 *   image: imageBlob,
 * });
 *
 * for (const mask of masks) {
 *   console.log(`${mask.label}: ${(mask.score * 100).toFixed(1)}%`);
 * }
 * ```
 *
 * @example Background removal
 * ```ts
 * const { masks } = await segmentImage({
 *   model: transformers.segmenter('briaai/RMBG-1.4'),
 *   image: photoImage,
 * });
 *
 * // Apply the foreground mask
 * const foregroundMask = masks.find(m => m.label === 'foreground');
 * ```
 *
 * @throws {Error} If segmentation fails
 */
export async function segmentImage(options: SegmentImageOptions): Promise<SegmentImageResult> {
  const { model: modelOrId, image, abortSignal, maxRetries = 2, providerOptions } = options;

  abortSignal?.throwIfAborted();

  const model = resolveModel(modelOrId);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    abortSignal?.throwIfAborted();

    try {
      const startTime = performance.now();

      const result = await model.doSegment({
        images: [image],
        abortSignal,
        providerOptions,
      });

      const durationMs = performance.now() - startTime;

      return {
        masks: result.results[0].masks,
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

  throw lastError || new Error('Image segmentation failed');
}

