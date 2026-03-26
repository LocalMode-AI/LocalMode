/**
 * Multimodal Image Embedding Functions
 *
 * Core embedImage() and embedManyImages() functions.
 * These accept MultimodalEmbeddingModel interface - implementations come
 * from provider packages (e.g., @localmode/transformers CLIP).
 *
 * @packageDocumentation
 */

import type {
  MultimodalEmbeddingModel,
  MultimodalEmbeddingModelFactory,
  EmbedImageOptions,
  EmbedImageResult,
  EmbedManyImagesOptions,
  EmbedManyImagesResult,
} from './types.js';

// Global provider for string model ID resolution
let globalMultimodalEmbeddingProvider: MultimodalEmbeddingModelFactory | null = null;

/**
 * Set the global multimodal embedding provider for string model ID resolution.
 *
 * @param provider - Factory function to create multimodal embedding models from string IDs
 *
 * @example
 * ```ts
 * import { setGlobalMultimodalEmbeddingProvider } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * setGlobalMultimodalEmbeddingProvider((modelId) =>
 *   transformers.multimodalEmbedding(modelId)
 * );
 * ```
 */
export function setGlobalMultimodalEmbeddingProvider(
  provider: MultimodalEmbeddingModelFactory | null
): void {
  globalMultimodalEmbeddingProvider = provider;
}

/**
 * Resolve a model from string ID or return the model object.
 */
function resolveModel(modelOrId: MultimodalEmbeddingModel | string): MultimodalEmbeddingModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalMultimodalEmbeddingProvider) {
    throw new Error(
      'No global multimodal embedding provider configured. ' +
        'Either pass a MultimodalEmbeddingModel object or call setGlobalMultimodalEmbeddingProvider() first.'
    );
  }

  return globalMultimodalEmbeddingProvider(modelOrId);
}

/**
 * Embed a single image using a multimodal embedding model.
 *
 * Produces a vector in the same space as text embeddings from the same model,
 * enabling cross-modal similarity search.
 *
 * @param options - Image embedding options
 * @returns Promise with embedding, usage, and response information
 *
 * @example Basic usage
 * ```ts
 * import { embedImage } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { embedding, usage, response } = await embedImage({
 *   model: transformers.multimodalEmbedding('Xenova/clip-vit-base-patch32'),
 *   image: imageBlob,
 * });
 *
 * console.log(embedding.length); // 512
 * ```
 *
 * @example Cross-modal search
 * ```ts
 * import { embed, embedImage, cosineSimilarity } from '@localmode/core';
 *
 * const model = transformers.multimodalEmbedding('Xenova/clip-vit-base-patch32');
 *
 * const { embedding: textVec } = await embed({ model, value: 'sunset over ocean' });
 * const { embedding: imgVec } = await embedImage({ model, image: photoBlob });
 *
 * const similarity = cosineSimilarity(textVec, imgVec);
 * ```
 *
 * @example With AbortSignal
 * ```ts
 * const controller = new AbortController();
 * setTimeout(() => controller.abort(), 10000);
 *
 * const { embedding } = await embedImage({
 *   model,
 *   image: largeImage,
 *   abortSignal: controller.signal,
 * });
 * ```
 *
 * @throws {Error} If embedding fails after all retries
 * @throws {Error} If aborted via AbortSignal
 * @throws {MultimodalEmbeddingError} If model does not support image modality
 *
 * @see {@link embedManyImages} for batch image embedding
 * @see {@link embed} for text embedding with the same model
 */
export async function embedImage(options: EmbedImageOptions): Promise<EmbedImageResult> {
  const {
    model: modelOrId,
    image,
    abortSignal,
    maxRetries = 2,
    headers,
    providerOptions,
  } = options;

  // Resolve string model ID to model object
  const model = resolveModel(modelOrId);

  // Check for cancellation before starting
  abortSignal?.throwIfAborted();

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check before each retry
    abortSignal?.throwIfAborted();

    try {
      const result = await model.doEmbedImage({
        images: [image],
        abortSignal,
        headers,
        providerOptions,
      });

      return {
        embedding: result.embeddings[0],
        usage: result.usage,
        response: result.response,
      };
    } catch (error) {
      lastError = error as Error;

      // Don't retry if aborted
      if (abortSignal?.aborted) {
        throw new Error('Image embedding was cancelled', { cause: lastError });
      }

      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }
    }
  }

  throw new Error(`Image embedding failed after ${maxRetries + 1} attempts`, {
    cause: lastError,
  });
}

/**
 * Embed multiple images using a multimodal embedding model.
 *
 * @param options - Batch image embedding options
 * @returns Promise with embeddings array, usage, and response information
 *
 * @example
 * ```ts
 * import { embedManyImages } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { embeddings, usage } = await embedManyImages({
 *   model: transformers.multimodalEmbedding('Xenova/clip-vit-base-patch32'),
 *   images: [image1, image2, image3],
 * });
 *
 * console.log(embeddings.length); // 3
 * console.log(embeddings[0].length); // 512
 * ```
 *
 * @see {@link embedImage} for single image embedding
 * @see {@link embedMany} for batch text embedding
 */
export async function embedManyImages(
  options: EmbedManyImagesOptions
): Promise<EmbedManyImagesResult> {
  const {
    model: modelOrId,
    images,
    abortSignal,
    maxRetries = 2,
    headers,
    providerOptions,
  } = options;

  // Resolve string model ID to model object
  const model = resolveModel(modelOrId);

  // Check for cancellation before starting
  abortSignal?.throwIfAborted();

  // If all images fit in one call (or no batch limit is defined)
  if (!model.maxEmbeddingsPerCall || images.length <= model.maxEmbeddingsPerCall) {
    const result = await embedImagesWithRetry(model, images, {
      abortSignal,
      maxRetries,
      headers,
      providerOptions,
    });

    return {
      embeddings: result.embeddings,
      usage: result.usage,
      response: result.response,
    };
  }

  // Batch processing for large image arrays
  const allEmbeddings: Float32Array[] = [];
  let totalTokens = 0;
  let lastResponse = { modelId: model.modelId, timestamp: new Date() };

  const batchSize = model.maxEmbeddingsPerCall;

  for (let i = 0; i < images.length; i += batchSize) {
    // Check for cancellation before each batch
    abortSignal?.throwIfAborted();

    const batch = images.slice(i, i + batchSize);
    const result = await embedImagesWithRetry(model, batch, {
      abortSignal,
      maxRetries,
      headers,
      providerOptions,
    });

    allEmbeddings.push(...result.embeddings);
    totalTokens += result.usage.tokens;
    lastResponse = result.response;
  }

  return {
    embeddings: allEmbeddings,
    usage: { tokens: totalTokens },
    response: lastResponse,
  };
}

/**
 * Helper function to embed images with retry logic.
 */
async function embedImagesWithRetry(
  model: MultimodalEmbeddingModel,
  images: Array<Blob | ImageData | string | ArrayBuffer>,
  options: {
    abortSignal?: AbortSignal;
    maxRetries: number;
    headers?: Record<string, string>;
    providerOptions?: Record<string, Record<string, unknown>>;
  }
): Promise<{
  embeddings: Float32Array[];
  usage: { tokens: number };
  response: { id?: string; modelId: string; timestamp: Date };
}> {
  const { abortSignal, maxRetries, headers, providerOptions } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    abortSignal?.throwIfAborted();

    try {
      return await model.doEmbedImage({
        images,
        abortSignal,
        headers,
        providerOptions,
      });
    } catch (error) {
      lastError = error as Error;

      if (abortSignal?.aborted) {
        throw new Error('Image embedding was cancelled', { cause: lastError });
      }

      if (attempt === maxRetries) {
        break;
      }
    }
  }

  throw new Error(`Image embedding failed after ${maxRetries + 1} attempts`, {
    cause: lastError,
  });
}
