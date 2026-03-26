/**
 * @file use-embed-many-images.ts
 * @description Hook for batch image embedding with @localmode/core embedManyImages()
 */

import type { MultimodalEmbeddingModel, EmbedManyImagesResult, ImageInput } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useEmbedManyImages hook */
interface UseEmbedManyImagesOptions {
  /** The multimodal embedding model to use */
  model: MultimodalEmbeddingModel;
}

/**
 * Hook for embedding multiple images in a single call.
 *
 * @param options - Multimodal embedding model configuration
 * @returns Operation state with execute(images: ImageInput[]) function
 *
 * @example
 * ```tsx
 * const { data, isLoading, execute } = useEmbedManyImages({
 *   model: transformers.multimodalEmbedding('Xenova/clip-vit-base-patch32'),
 * });
 * await execute([imageBlob1, imageBlob2]);
 * // data = { embeddings: [Float32Array, Float32Array], usage: { ... } }
 * ```
 */
export function useEmbedManyImages(options: UseEmbedManyImagesOptions) {
  const { model } = options;

  return useOperation<[ImageInput[]], EmbedManyImagesResult>({
    fn: async (images: ImageInput[], signal: AbortSignal) => {
      const { embedManyImages } = await import('@localmode/core');
      return embedManyImages({ model, images, abortSignal: signal });
    },
  });
}
