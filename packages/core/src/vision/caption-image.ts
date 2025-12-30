/**
 * Image Captioning Functions
 *
 * Core captionImage() function for generating image descriptions.
 * This function accepts ImageCaptionModel interface - implementations come from provider packages.
 *
 * @packageDocumentation
 */

import type {
  ImageCaptionModel,
  CaptionImageOptions,
  CaptionImageResult,
} from './types.js';

// Global provider registry for string model ID resolution
let globalImageCaptionRegistry: GlobalImageCaptionRegistry | null = null;

interface GlobalImageCaptionRegistry {
  resolve(id: string): ImageCaptionModel;
}

/**
 * Set the global image captioning provider registry for string model ID resolution.
 * Call this once at app initialization.
 *
 * @example
 * ```ts
 * import { setGlobalImageCaptionProvider } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * setGlobalImageCaptionProvider({
 *   transformers,
 * });
 *
 * // Now string model IDs work
 * const { caption } = await captionImage({
 *   model: 'transformers:Xenova/blip-image-captioning-base',
 *   image: imageBlob,
 * });
 * ```
 */
export function setGlobalImageCaptionProvider(
  providers: Record<string, { captioner: (modelId: string) => ImageCaptionModel }>,
  options?: { separator?: string }
): void {
  const separator = options?.separator ?? ':';

  globalImageCaptionRegistry = {
    resolve(id: string): ImageCaptionModel {
      const sepIndex = id.indexOf(separator);
      if (sepIndex === -1) {
        throw new Error(
          `Invalid model ID format: "${id}". Expected "provider${separator}modelId" format.`
        );
      }

      const providerName = id.slice(0, sepIndex);
      const modelId = id.slice(sepIndex + 1);

      const provider = providers[providerName];
      if (!provider) {
        throw new Error(
          `Unknown provider: "${providerName}". Available providers: ${Object.keys(providers).join(', ')}`
        );
      }

      return provider.captioner(modelId);
    },
  };
}

/**
 * Resolve an image captioning model from string ID or return the model object as-is.
 */
function resolveImageCaptionModel(modelOrId: ImageCaptionModel | string): ImageCaptionModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalImageCaptionRegistry) {
    throw new Error(
      'No global provider configured. Call setGlobalImageCaptionProvider() first, or pass a model object instead of a string.'
    );
  }

  return globalImageCaptionRegistry.resolve(modelOrId);
}

/**
 * Generate a caption for an image using the specified model.
 *
 * Image captioning models (like BLIP) automatically generate natural language
 * descriptions of image content. This is useful for accessibility, content
 * indexing, and image search.
 *
 * This function is in @localmode/core - model implementations are in provider packages.
 *
 * @param options - Captioning options
 * @returns Promise with caption, usage, and response information
 *
 * @example Basic usage
 * ```ts
 * import { captionImage } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { caption, usage } = await captionImage({
 *   model: transformers.captioner('Xenova/blip-image-captioning-base'),
 *   image: imageBlob,
 * });
 *
 * console.log(caption);
 * // Output: "a golden retriever playing with a ball in a park"
 * ```
 *
 * @example For accessibility
 * ```ts
 * // Generate alt text for images
 * const { caption } = await captionImage({
 *   model: transformers.captioner('Xenova/blip-image-captioning-base'),
 *   image: uploadedImage,
 * });
 *
 * img.alt = caption;
 * ```
 *
 * @example For image search
 * ```ts
 * // Index images by their captions for semantic search
 * for (const image of images) {
 *   const { caption } = await captionImage({
 *     model: captioningModel,
 *     image,
 *   });
 *
 *   const { embedding } = await embed({
 *     model: embeddingModel,
 *     value: caption,
 *   });
 *
 *   await db.add({
 *     id: image.id,
 *     vector: embedding,
 *     metadata: { caption, imagePath: image.path },
 *   });
 * }
 * ```
 *
 * @example With string model ID (requires global provider setup)
 * ```ts
 * const { caption } = await captionImage({
 *   model: 'transformers:Xenova/blip-image-captioning-base',
 *   image: imageBlob,
 * });
 * ```
 *
 * @example With AbortSignal
 * ```ts
 * const controller = new AbortController();
 * setTimeout(() => controller.abort(), 10000);
 *
 * const { caption } = await captionImage({
 *   model: transformers.captioner('Xenova/blip-image-captioning-base'),
 *   image: imageBlob,
 *   abortSignal: controller.signal,
 * });
 * ```
 *
 * @throws {Error} If captioning fails after all retries
 * @throws {Error} If aborted via AbortSignal
 *
 * @see {@link classifyImage} for image classification
 */
export async function captionImage(options: CaptionImageOptions): Promise<CaptionImageResult> {
  const {
    model: modelOrId,
    image,
    maxLength,
    abortSignal,
    maxRetries = 2,
    providerOptions,
  } = options;

  // Resolve string model ID to model object
  const model = resolveImageCaptionModel(modelOrId);

  // Check for cancellation before starting
  abortSignal?.throwIfAborted();

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check before each retry
    abortSignal?.throwIfAborted();

    try {
      const result = await model.doCaption({
        images: [image],
        maxLength,
        abortSignal,
        providerOptions,
      });

      return {
        caption: result.captions[0],
        usage: result.usage,
        response: {
          modelId: model.modelId,
          timestamp: new Date(),
        },
      };
    } catch (error) {
      lastError = error as Error;

      // Don't retry if aborted
      if (abortSignal?.aborted) {
        throw new Error('Image captioning was cancelled', { cause: lastError });
      }

      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }
    }
  }

  throw new Error(`Image captioning failed after ${maxRetries + 1} attempts`, {
    cause: lastError,
  });
}

