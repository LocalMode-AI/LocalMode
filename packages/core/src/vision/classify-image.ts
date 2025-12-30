/**
 * Image Classification Functions
 *
 * Core classifyImage() and classifyImageZeroShot() functions.
 * These functions accept ImageClassificationModel interface - implementations come from provider packages.
 *
 * @packageDocumentation
 */

import type {
  ImageClassificationModel,
  ZeroShotImageClassificationModel,
  ClassifyImageOptions,
  ClassifyImageResult,
  ClassifyImageZeroShotOptions,
  ClassifyImageZeroShotResult,
} from './types.js';

// Global provider registry for string model ID resolution
let globalImageClassificationRegistry: GlobalImageClassificationRegistry | null = null;

interface GlobalImageClassificationRegistry {
  resolveClassifier(id: string): ImageClassificationModel;
  resolveZeroShot(id: string): ZeroShotImageClassificationModel;
}

/**
 * Set the global image classification provider registry for string model ID resolution.
 * Call this once at app initialization.
 *
 * @example
 * ```ts
 * import { setGlobalImageClassificationProvider } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * setGlobalImageClassificationProvider({
 *   transformers,
 * });
 *
 * // Now string model IDs work
 * const { predictions } = await classifyImage({
 *   model: 'transformers:Xenova/vit-base-patch16-224',
 *   image: imageBlob,
 * });
 * ```
 */
export function setGlobalImageClassificationProvider(
  providers: Record<
    string,
    {
      imageClassifier: (modelId: string) => ImageClassificationModel;
      zeroShotImageClassifier: (modelId: string) => ZeroShotImageClassificationModel;
    }
  >,
  options?: { separator?: string }
): void {
  const separator = options?.separator ?? ':';

  globalImageClassificationRegistry = {
    resolveClassifier(id: string): ImageClassificationModel {
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

      return provider.imageClassifier(modelId);
    },

    resolveZeroShot(id: string): ZeroShotImageClassificationModel {
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

      return provider.zeroShotImageClassifier(modelId);
    },
  };
}

/**
 * Resolve an image classification model from string ID or return the model object as-is.
 */
function resolveImageClassificationModel(
  modelOrId: ImageClassificationModel | string
): ImageClassificationModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalImageClassificationRegistry) {
    throw new Error(
      'No global provider configured. Call setGlobalImageClassificationProvider() first, or pass a model object instead of a string.'
    );
  }

  return globalImageClassificationRegistry.resolveClassifier(modelOrId);
}

/**
 * Resolve a zero-shot image classification model from string ID or return the model object as-is.
 */
function resolveZeroShotImageModel(
  modelOrId: ZeroShotImageClassificationModel | string
): ZeroShotImageClassificationModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalImageClassificationRegistry) {
    throw new Error(
      'No global provider configured. Call setGlobalImageClassificationProvider() first, or pass a model object instead of a string.'
    );
  }

  return globalImageClassificationRegistry.resolveZeroShot(modelOrId);
}

/**
 * Classify an image using the specified model.
 *
 * This function uses pre-trained image classification models to identify
 * objects, scenes, or concepts in images.
 *
 * This function is in @localmode/core - model implementations are in provider packages.
 *
 * @param options - Classification options
 * @returns Promise with predictions, usage, and response information
 *
 * @example Basic usage
 * ```ts
 * import { classifyImage } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { predictions, usage } = await classifyImage({
 *   model: transformers.imageClassifier('Xenova/vit-base-patch16-224'),
 *   image: imageBlob,
 *   topK: 5,
 * });
 *
 * predictions.forEach(p => {
 *   console.log(`${p.label}: ${(p.score * 100).toFixed(1)}%`);
 * });
 * // Output:
 * // golden retriever: 92.3%
 * // Labrador retriever: 4.1%
 * // ...
 * ```
 *
 * @example With string model ID (requires global provider setup)
 * ```ts
 * const { predictions } = await classifyImage({
 *   model: 'transformers:Xenova/vit-base-patch16-224',
 *   image: imageBlob,
 * });
 * ```
 *
 * @example With AbortSignal
 * ```ts
 * const controller = new AbortController();
 * setTimeout(() => controller.abort(), 5000);
 *
 * const { predictions } = await classifyImage({
 *   model: transformers.imageClassifier('Xenova/vit-base-patch16-224'),
 *   image: imageBlob,
 *   abortSignal: controller.signal,
 * });
 * ```
 *
 * @throws {Error} If classification fails after all retries
 * @throws {Error} If aborted via AbortSignal
 *
 * @see {@link classifyImageZeroShot} for zero-shot image classification
 */
export async function classifyImage(
  options: ClassifyImageOptions
): Promise<ClassifyImageResult> {
  const {
    model: modelOrId,
    image,
    topK = 5,
    abortSignal,
    maxRetries = 2,
    providerOptions,
  } = options;

  // Resolve string model ID to model object
  const model = resolveImageClassificationModel(modelOrId);

  // Check for cancellation before starting
  abortSignal?.throwIfAborted();

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check before each retry
    abortSignal?.throwIfAborted();

    try {
      const result = await model.doClassify({
        images: [image],
        topK,
        abortSignal,
        providerOptions,
      });

      return {
        predictions: result.results[0],
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
        throw new Error('Image classification was cancelled', { cause: lastError });
      }

      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }
    }
  }

  throw new Error(`Image classification failed after ${maxRetries + 1} attempts`, {
    cause: lastError,
  });
}

/**
 * Classify an image into arbitrary labels using zero-shot classification.
 *
 * Zero-shot image classification (e.g., using CLIP) allows you to classify images
 * into any set of labels without fine-tuning the model.
 *
 * @param options - Zero-shot classification options
 * @returns Promise with labels, scores, usage, and response information
 *
 * @example Basic usage
 * ```ts
 * import { classifyImageZeroShot } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { labels, scores } = await classifyImageZeroShot({
 *   model: transformers.zeroShotImageClassifier('Xenova/clip-vit-base-patch32'),
 *   image: imageBlob,
 *   candidateLabels: ['cat', 'dog', 'bird', 'car', 'tree'],
 * });
 *
 * console.log(`Top prediction: ${labels[0]} (${(scores[0] * 100).toFixed(1)}%)`);
 * // Output: Top prediction: dog (87.2%)
 * ```
 *
 * @example Photo organization
 * ```ts
 * const { labels, scores } = await classifyImageZeroShot({
 *   model: transformers.zeroShotImageClassifier('Xenova/clip-vit-base-patch32'),
 *   image: vacationPhoto,
 *   candidateLabels: ['beach', 'mountain', 'city', 'forest', 'desert'],
 * });
 *
 * // Use for automatic photo tagging
 * const tags = labels.filter((_, i) => scores[i] > 0.2);
 * ```
 *
 * @see {@link classifyImage} for standard image classification with fixed labels
 */
export async function classifyImageZeroShot(
  options: ClassifyImageZeroShotOptions
): Promise<ClassifyImageZeroShotResult> {
  const {
    model: modelOrId,
    image,
    candidateLabels,
    abortSignal,
    maxRetries = 2,
    providerOptions,
  } = options;

  // Resolve string model ID to model object
  const model = resolveZeroShotImageModel(modelOrId);

  // Check for cancellation before starting
  abortSignal?.throwIfAborted();

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check before each retry
    abortSignal?.throwIfAborted();

    try {
      const result = await model.doClassifyZeroShot({
        images: [image],
        candidateLabels,
        abortSignal,
        providerOptions,
      });

      const item = result.results[0];

      return {
        labels: item.labels,
        scores: item.scores,
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
        throw new Error('Zero-shot image classification was cancelled', { cause: lastError });
      }

      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }
    }
  }

  throw new Error(`Zero-shot image classification failed after ${maxRetries + 1} attempts`, {
    cause: lastError,
  });
}

