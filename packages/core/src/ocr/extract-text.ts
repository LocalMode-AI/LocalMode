/**
 * OCR Functions
 *
 * Function-first API for optical character recognition.
 *
 * @packageDocumentation
 */

import type {
  OCRModel,
  ExtractTextOptions,
  ExtractTextResult,
  ExtractTextManyOptions,
  ExtractTextManyResult,
  OCRModelFactory,
} from './types.js';

// Global provider for string model ID resolution
let globalOCRProvider: OCRModelFactory | null = null;

/**
 * Set the global OCR provider for string model ID resolution.
 *
 * @param provider - Factory function to create OCR models from string IDs
 */
export function setGlobalOCRProvider(provider: OCRModelFactory | null): void {
  globalOCRProvider = provider;
}

/**
 * Resolve a model from string ID or return the model object.
 */
function resolveModel(modelOrId: OCRModel | string): OCRModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalOCRProvider) {
    throw new Error(
      'No global OCR provider configured. ' +
        'Either pass an OCRModel object or call setGlobalOCRProvider() first.'
    );
  }

  return globalOCRProvider(modelOrId);
}

/**
 * Extract text from an image using an OCR model.
 *
 * @param options - OCR options including model and image
 * @returns Promise with extracted text and usage information
 *
 * @example Basic usage
 * ```ts
 * import { extractText } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { text, usage } = await extractText({
 *   model: transformers.ocr('Xenova/trocr-base-handwritten'),
 *   image: imageBlob,
 * });
 *
 * console.log(text);
 * console.log(`Extracted in ${usage.durationMs}ms`);
 * ```
 *
 * @example With region detection
 * ```ts
 * const { text, regions } = await extractText({
 *   model: transformers.ocr('Xenova/trocr-base-printed'),
 *   image: documentImage,
 *   detectRegions: true,
 * });
 *
 * for (const region of regions || []) {
 *   console.log(`Found: "${region.text}" at (${region.bbox?.x}, ${region.bbox?.y})`);
 * }
 * ```
 *
 * @throws {Error} If OCR fails
 */
export async function extractText(options: ExtractTextOptions): Promise<ExtractTextResult> {
  const {
    model: modelOrId,
    image,
    languages,
    detectRegions = false,
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

      const result = await model.doOCR({
        images: [image],
        languages,
        detectRegions,
        abortSignal,
        providerOptions,
      });

      const durationMs = performance.now() - startTime;

      return {
        text: result.texts[0],
        regions: result.regions?.[0],
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

  throw lastError || new Error('OCR failed');
}

/**
 * Extract text from multiple images using an OCR model.
 *
 * @param options - OCR options including model and images
 * @returns Promise with extracted texts
 *
 * @example
 * ```ts
 * const { texts } = await extractTextMany({
 *   model: transformers.ocr('Xenova/trocr-base-handwritten'),
 *   images: [page1, page2, page3],
 * });
 *
 * const fullDocument = texts.join('\n\n');
 * ```
 */
export async function extractTextMany(
  options: ExtractTextManyOptions
): Promise<ExtractTextManyResult> {
  const {
    model: modelOrId,
    images,
    languages,
    detectRegions = false,
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

      const result = await model.doOCR({
        images,
        languages,
        detectRegions,
        abortSignal,
        providerOptions,
      });

      const durationMs = performance.now() - startTime;

      return {
        texts: result.texts,
        regions: result.regions,
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

  throw lastError || new Error('OCR failed');
}

