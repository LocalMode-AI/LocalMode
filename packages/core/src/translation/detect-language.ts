/**
 * Language Detection Function
 *
 * Function-first API for detecting the language of input text.
 *
 * @packageDocumentation
 */

import type {
  LanguageDetectionModel,
  LanguageDetectionModelFactory,
  DetectLanguageOptions,
  DetectLanguageResult,
} from './types.js';

// Global provider for string model ID resolution
let globalLanguageDetectionProvider: LanguageDetectionModelFactory | null = null;

/**
 * Set the global language detection provider for string model ID resolution.
 *
 * @param provider - Factory function to create language detection models from string IDs
 */
export function setGlobalLanguageDetectionProvider(
  provider: LanguageDetectionModelFactory | null
): void {
  globalLanguageDetectionProvider = provider;
}

/**
 * Resolve a model from string ID or return the model object.
 */
function resolveModel(
  modelOrId: LanguageDetectionModel | string
): LanguageDetectionModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalLanguageDetectionProvider) {
    throw new Error(
      'No global language detection provider configured. ' +
        'Either pass a LanguageDetectionModel object or call setGlobalLanguageDetectionProvider() first.'
    );
  }

  return globalLanguageDetectionProvider(modelOrId);
}

/**
 * Detect the language of a text string.
 *
 * Returns candidate languages with ISO 639-1 codes and confidence scores,
 * sorted by confidence descending.
 *
 * @param options - Detection options including model and text
 * @returns Promise with detected languages and usage information
 *
 * @example Basic usage
 * ```ts
 * import { detectLanguage } from '@localmode/core';
 * import { mediapipe } from '@localmode/mediapipe';
 *
 * const { languages } = await detectLanguage({
 *   model: mediapipe.languageDetector(),
 *   text: 'Bonjour le monde',
 * });
 *
 * console.log(`${languages[0].languageCode}: ${languages[0].confidence}`);
 * ```
 *
 * @throws {Error} If detection fails after all retries
 * @throws {Error} If aborted via AbortSignal
 */
export async function detectLanguage(
  options: DetectLanguageOptions
): Promise<DetectLanguageResult> {
  const {
    model: modelOrId,
    text,
    maxResults = 5,
    minConfidence = 0,
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

      const result = await model.doDetect({
        text,
        abortSignal,
        providerOptions,
      });

      const durationMs = performance.now() - startTime;

      const languages = result.languages
        .filter((lang) => lang.confidence >= minConfidence)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, maxResults);

      return {
        languages,
        usage: {
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

  throw lastError || new Error('Language detection failed');
}
