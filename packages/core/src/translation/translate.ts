/**
 * Translation Functions
 *
 * Function-first API for translating text.
 *
 * @packageDocumentation
 */

import type {
  TranslationModel,
  TranslateOptions,
  TranslateResult,
  TranslateManyOptions,
  TranslateManyResult,
  TranslationModelFactory,
} from './types.js';

// Global provider for string model ID resolution
let globalTranslationProvider: TranslationModelFactory | null = null;

/**
 * Set the global translation provider for string model ID resolution.
 *
 * @param provider - Factory function to create translation models from string IDs
 *
 * @example
 * ```ts
 * import { setGlobalTranslationProvider } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * setGlobalTranslationProvider((modelId) => transformers.translator(modelId));
 *
 * // Now you can use string model IDs
 * const { translation } = await translate({
 *   model: 'Xenova/opus-mt-en-de',
 *   text: 'Hello',
 *   targetLanguage: 'de',
 * });
 * ```
 */
export function setGlobalTranslationProvider(provider: TranslationModelFactory | null): void {
  globalTranslationProvider = provider;
}

/**
 * Resolve a model from string ID or return the model object.
 */
function resolveModel(modelOrId: TranslationModel | string): TranslationModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalTranslationProvider) {
    throw new Error(
      'No global translation provider configured. ' +
        'Either pass a TranslationModel object or call setGlobalTranslationProvider() first.'
    );
  }

  return globalTranslationProvider(modelOrId);
}

/**
 * Translate text using a translation model.
 *
 * @param options - Translation options including model, text, and target language
 * @returns Promise with translated text and usage information
 *
 * @example Basic usage
 * ```ts
 * import { translate } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { translation, usage } = await translate({
 *   model: transformers.translator('Xenova/opus-mt-en-de'),
 *   text: 'Hello, how are you?',
 *   targetLanguage: 'de',
 * });
 *
 * console.log(translation); // "Hallo, wie geht es dir?"
 * console.log(`Translated in ${usage.durationMs}ms`);
 * ```
 *
 * @example With source language
 * ```ts
 * const { translation } = await translate({
 *   model: transformers.translator('Xenova/nllb-200-distilled-600M'),
 *   text: 'Bonjour le monde',
 *   sourceLanguage: 'fra_Latn',
 *   targetLanguage: 'eng_Latn',
 * });
 * ```
 *
 * @throws {Error} If translation fails
 */
export async function translate(options: TranslateOptions): Promise<TranslateResult> {
  const {
    model: modelOrId,
    text,
    sourceLanguage,
    targetLanguage,
    abortSignal,
    maxRetries = 2,
    providerOptions,
  } = options;

  // Check for cancellation before starting
  abortSignal?.throwIfAborted();

  // Resolve the model
  const model = resolveModel(modelOrId);

  let lastError: Error | null = null;

  // Retry loop
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check for cancellation before each attempt
    abortSignal?.throwIfAborted();

    try {
      const startTime = performance.now();

      const result = await model.doTranslate({
        texts: [text],
        sourceLanguage,
        targetLanguage,
        abortSignal,
        providerOptions,
      });

      const durationMs = performance.now() - startTime;

      return {
        translation: result.translations[0],
        detectedLanguage: result.detectedLanguage,
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

      // Don't retry on abort
      if (abortSignal?.aborted) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        throw error;
      }

      // Wait before retry (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Translation failed');
}

/**
 * Translate multiple texts using a translation model.
 *
 * @param options - Translation options including model, texts, and target language
 * @returns Promise with translated texts and usage information
 *
 * @example
 * ```ts
 * const { translations } = await translateMany({
 *   model: transformers.translator('Xenova/opus-mt-en-de'),
 *   texts: ['Hello', 'Goodbye', 'Thank you'],
 *   targetLanguage: 'de',
 * });
 *
 * console.log(translations); // ["Hallo", "Auf Wiedersehen", "Danke"]
 * ```
 */
export async function translateMany(options: TranslateManyOptions): Promise<TranslateManyResult> {
  const {
    model: modelOrId,
    texts,
    sourceLanguage,
    targetLanguage,
    abortSignal,
    maxRetries = 2,
    providerOptions,
  } = options;

  // Check for cancellation before starting
  abortSignal?.throwIfAborted();

  // Resolve the model
  const model = resolveModel(modelOrId);

  let lastError: Error | null = null;

  // Retry loop
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check for cancellation before each attempt
    abortSignal?.throwIfAborted();

    try {
      const startTime = performance.now();

      const result = await model.doTranslate({
        texts,
        sourceLanguage,
        targetLanguage,
        abortSignal,
        providerOptions,
      });

      const durationMs = performance.now() - startTime;

      return {
        translations: result.translations,
        detectedLanguage: result.detectedLanguage,
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

      // Don't retry on abort
      if (abortSignal?.aborted) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        throw error;
      }

      // Wait before retry
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Translation failed');
}

