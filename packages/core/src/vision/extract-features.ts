/**
 * Image Feature Extraction Function
 *
 * Function-first API for extracting feature vectors from images.
 *
 * @packageDocumentation
 */

import type {
  ImageFeatureModel,
  ExtractImageFeaturesOptions,
  ExtractImageFeaturesResult,
  ImageFeatureModelFactory,
} from './types.js';

// Global provider for string model ID resolution
let globalImageFeatureProvider: ImageFeatureModelFactory | null = null;

/**
 * Set the global image feature provider for string model ID resolution.
 *
 * @param provider - Factory function to create image feature models from string IDs
 */
export function setGlobalImageFeatureProvider(provider: ImageFeatureModelFactory | null): void {
  globalImageFeatureProvider = provider;
}

/**
 * Resolve a model from string ID or return the model object.
 */
function resolveModel(modelOrId: ImageFeatureModel | string): ImageFeatureModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalImageFeatureProvider) {
    throw new Error(
      'No global image feature provider configured. ' +
        'Either pass an ImageFeatureModel object or call setGlobalImageFeatureProvider() first.'
    );
  }

  return globalImageFeatureProvider(modelOrId);
}

/**
 * Extract feature vectors from an image.
 *
 * Useful for image similarity search, reverse image search, and clustering.
 *
 * @param options - Feature extraction options including model and image
 * @returns Promise with feature vector and usage information
 *
 * @example Basic usage
 * ```ts
 * import { extractImageFeatures, cosineSimilarity } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const model = transformers.imageFeatures('Xenova/clip-vit-base-patch32');
 *
 * const { features: features1 } = await extractImageFeatures({
 *   model,
 *   image: image1,
 * });
 *
 * const { features: features2 } = await extractImageFeatures({
 *   model,
 *   image: image2,
 * });
 *
 * const similarity = cosineSimilarity(features1, features2);
 * console.log(`Image similarity: ${(similarity * 100).toFixed(1)}%`);
 * ```
 *
 * @example Store in vector database
 * ```ts
 * const { features } = await extractImageFeatures({
 *   model: transformers.imageFeatures('Xenova/clip-vit-base-patch32'),
 *   image: productImage,
 * });
 *
 * await vectorDB.add({
 *   id: 'product-123',
 *   vector: features,
 *   metadata: { name: 'Product Name', imageUrl: '...' },
 * });
 * ```
 *
 * @throws {Error} If feature extraction fails
 */
export async function extractImageFeatures(
  options: ExtractImageFeaturesOptions
): Promise<ExtractImageFeaturesResult> {
  const { model: modelOrId, image, abortSignal, maxRetries = 2, providerOptions } = options;

  abortSignal?.throwIfAborted();

  const model = resolveModel(modelOrId);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    abortSignal?.throwIfAborted();

    try {
      const startTime = performance.now();

      const result = await model.doExtract({
        images: [image],
        abortSignal,
        providerOptions,
      });

      const durationMs = performance.now() - startTime;

      return {
        features: result.features[0],
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

  throw lastError || new Error('Image feature extraction failed');
}

