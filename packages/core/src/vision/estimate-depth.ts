/**
 * Depth Estimation Function
 *
 * Core estimateDepth() function for generating depth maps from images.
 * This function accepts DepthEstimationModel interface - implementations come from provider packages.
 *
 * @packageDocumentation
 */

import type {
  DepthEstimationModel,
  EstimateDepthOptions,
  EstimateDepthResult,
  DepthEstimationModelFactory,
} from './types.js';

// Global provider for string model ID resolution
let globalDepthEstimationProvider: DepthEstimationModelFactory | null = null;

/**
 * Set the global depth estimation provider for string model ID resolution.
 *
 * @param provider - Factory function to create depth estimation models from string IDs
 */
export function setGlobalDepthEstimationProvider(
  provider: DepthEstimationModelFactory | null
): void {
  globalDepthEstimationProvider = provider;
}

/**
 * Resolve a model from string ID or return the model object.
 */
function resolveModel(modelOrId: DepthEstimationModel | string): DepthEstimationModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalDepthEstimationProvider) {
    throw new Error(
      'No global depth estimation provider configured. ' +
        'Either pass a DepthEstimationModel object or call setGlobalDepthEstimationProvider() first.'
    );
  }

  return globalDepthEstimationProvider(modelOrId);
}

/**
 * Estimate depth from an image, producing a depth map.
 *
 * This function uses depth estimation models (e.g., Depth Anything, DPT) to generate
 * per-pixel depth maps from single images. Useful for AR/VR, 3D reconstruction, and robotics.
 *
 * This function is in @localmode/core - model implementations are in provider packages.
 *
 * @param options - Depth estimation options including model and image
 * @returns Promise with depth map, usage, and response information
 *
 * @example Basic usage
 * ```ts
 * import { estimateDepth } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { depthMap, usage } = await estimateDepth({
 *   model: transformers.depthEstimator('Xenova/depth-anything-small-hf'),
 *   image: imageBlob,
 * });
 *
 * // depthMap is Float32Array with per-pixel depth values
 * console.log(`Depth map size: ${depthMap.length} pixels`);
 * console.log(`Processing time: ${usage.durationMs}ms`);
 * ```
 *
 * @example With AbortSignal
 * ```ts
 * const controller = new AbortController();
 * setTimeout(() => controller.abort(), 10000);
 *
 * const { depthMap } = await estimateDepth({
 *   model: transformers.depthEstimator('Xenova/depth-anything-small-hf'),
 *   image: imageBlob,
 *   abortSignal: controller.signal,
 * });
 * ```
 *
 * @throws {Error} If depth estimation fails after all retries
 * @throws {Error} If aborted via AbortSignal
 */
export async function estimateDepth(
  options: EstimateDepthOptions
): Promise<EstimateDepthResult> {
  const { model: modelOrId, image, abortSignal, maxRetries = 2, providerOptions } = options;

  abortSignal?.throwIfAborted();

  const model = resolveModel(modelOrId);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    abortSignal?.throwIfAborted();

    try {
      const startTime = performance.now();

      const result = await model.doEstimate({
        images: [image],
        abortSignal,
        providerOptions,
      });

      const durationMs = performance.now() - startTime;

      return {
        depthMap: result.depthMaps[0],
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

  throw lastError || new Error('Depth estimation failed');
}
