/**
 * @file use-embed-image.ts
 * @description Hook for single-image embedding with @localmode/core embedImage()
 */

import type { MultimodalEmbeddingModel, EmbedImageResult, ImageInput } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useEmbedImage hook */
interface UseEmbedImageOptions {
  /** The multimodal embedding model to use */
  model: MultimodalEmbeddingModel;
}

/**
 * Hook for embedding a single image.
 *
 * @param options - Multimodal embedding model configuration
 * @returns Operation state with execute(image: ImageInput) function
 *
 * @example
 * ```tsx
 * const { data, isLoading, execute } = useEmbedImage({
 *   model: transformers.multimodalEmbedding('Xenova/clip-vit-base-patch32'),
 * });
 * await execute(imageBlob);
 * // data = { embedding: Float32Array, usage: { tokens: 1 }, response: { ... } }
 * ```
 */
export function useEmbedImage(options: UseEmbedImageOptions) {
  const { model } = options;

  return useOperation<[ImageInput], EmbedImageResult>({
    fn: async (image: ImageInput, signal: AbortSignal) => {
      const { embedImage } = await import('@localmode/core');
      return embedImage({ model, image, abortSignal: signal });
    },
  });
}
