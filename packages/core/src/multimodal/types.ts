/**
 * Multimodal Embeddings Domain Types
 *
 * Interfaces for models that produce embeddings from multiple modalities
 * (text, image, audio) in a shared vector space. The canonical example is
 * CLIP, which maps both text and images into the same 512-dimensional space
 * so that cosine similarity reflects cross-modal relevance.
 *
 * A MultimodalEmbeddingModel extends the standard EmbeddingModel<string>
 * (text embeddings) and adds methods for embedding images (and optionally
 * audio). This means it works as a drop-in text embedder everywhere the
 * standard embed() function is used.
 *
 * @packageDocumentation
 */

import type { ImageInput } from '../vision/types.js';
import type { EmbeddingModel, DoEmbedResult, EmbeddingUsage, EmbeddingResponse } from '../embeddings/types.js';

// Re-export ImageInput so consumers don't need a separate vision import
export type { ImageInput } from '../vision/types.js';

// ═══════════════════════════════════════════════════════════════
// MULTIMODAL EMBEDDING MODEL INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Supported input modalities for multimodal embedding models.
 */
export type EmbeddingModality = 'text' | 'image' | 'audio';

/**
 * Interface for multimodal embedding models (e.g., CLIP, SigLIP).
 *
 * Extends EmbeddingModel<string> so it works as a standard text embedder.
 * Additionally supports embedding images (and optionally audio) into the
 * same vector space.
 *
 * @example Usage with CLIP
 * ```ts
 * import { embedImage, embed } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const model = transformers.multimodalEmbedding('Xenova/clip-vit-base-patch32');
 *
 * // Embed text (standard EmbeddingModel interface)
 * const { embedding: textVec } = await embed({ model, value: 'a photo of a cat' });
 *
 * // Embed image (multimodal extension)
 * const { embedding: imageVec } = await embedImage({ model, image: catImage });
 *
 * // Compare across modalities
 * const similarity = cosineSimilarity(textVec, imageVec);
 * ```
 *
 * @see {@link embedImage} - Embed a single image
 * @see {@link embedManyImages} - Embed multiple images
 */
export interface MultimodalEmbeddingModel extends EmbeddingModel<string> {
  /** Modalities this model supports (always includes 'text') */
  readonly supportedModalities: EmbeddingModality[];

  /**
   * Generate embeddings for the given images.
   *
   * @param options - Image embedding options
   * @returns Promise with embeddings, usage, and response info
   */
  doEmbedImage(options: DoEmbedImageOptions): Promise<DoEmbedResult>;

  /**
   * Generate embeddings for the given audio inputs (optional).
   *
   * Not all multimodal models support audio. Check `supportedModalities`
   * before calling.
   *
   * @param options - Audio embedding options
   * @returns Promise with embeddings, usage, and response info
   */
  doEmbedAudio?(options: DoEmbedAudioOptions): Promise<DoEmbedResult>;
}

// ═══════════════════════════════════════════════════════════════
// DO-LEVEL OPTIONS (passed to model implementations)
// ═══════════════════════════════════════════════════════════════

/**
 * Options passed to MultimodalEmbeddingModel.doEmbedImage()
 */
export interface DoEmbedImageOptions {
  /** Images to embed */
  images: ImageInput[];

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Custom headers to include in requests */
  headers?: Record<string, string>;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Options passed to MultimodalEmbeddingModel.doEmbedAudio()
 */
export interface DoEmbedAudioOptions {
  /** Audio inputs to embed */
  audio: Array<Blob | ArrayBuffer | Float32Array>;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Custom headers to include in requests */
  headers?: Record<string, string>;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

// ═══════════════════════════════════════════════════════════════
// EMBED IMAGE FUNCTION OPTIONS & RESULTS
// ═══════════════════════════════════════════════════════════════

/**
 * Options for the embedImage() function.
 *
 * @example
 * ```ts
 * const { embedding } = await embedImage({
 *   model: transformers.multimodalEmbedding('Xenova/clip-vit-base-patch32'),
 *   image: imageBlob,
 *   maxRetries: 3,
 * });
 * ```
 */
export interface EmbedImageOptions {
  /** The multimodal embedding model to use */
  model: MultimodalEmbeddingModel | string;

  /** The image to embed */
  image: ImageInput;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Custom headers to include in requests */
  headers?: Record<string, string>;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the embedImage() function.
 */
export interface EmbedImageResult {
  /** The generated embedding vector */
  embedding: Float32Array;

  /** Token/pixel usage information */
  usage: EmbeddingUsage;

  /** Response metadata */
  response: EmbeddingResponse;
}

// ═══════════════════════════════════════════════════════════════
// EMBED MANY IMAGES FUNCTION OPTIONS & RESULTS
// ═══════════════════════════════════════════════════════════════

/**
 * Options for the embedManyImages() function.
 *
 * @example
 * ```ts
 * const { embeddings } = await embedManyImages({
 *   model: transformers.multimodalEmbedding('Xenova/clip-vit-base-patch32'),
 *   images: [imageBlob1, imageBlob2, imageBlob3],
 * });
 * ```
 */
export interface EmbedManyImagesOptions {
  /** The multimodal embedding model to use */
  model: MultimodalEmbeddingModel | string;

  /** The images to embed */
  images: ImageInput[];

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts per batch (default: 2) */
  maxRetries?: number;

  /** Custom headers to include in requests */
  headers?: Record<string, string>;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the embedManyImages() function.
 */
export interface EmbedManyImagesResult {
  /** The generated embedding vectors (one per input image) */
  embeddings: Float32Array[];

  /** Usage information (combined for all embeddings) */
  usage: EmbeddingUsage;

  /** Response metadata */
  response: EmbeddingResponse;
}

// ═══════════════════════════════════════════════════════════════
// FACTORY TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Factory function type for creating multimodal embedding models.
 */
export type MultimodalEmbeddingModelFactory = (
  modelId: string,
  settings?: Record<string, unknown>
) => MultimodalEmbeddingModel;
