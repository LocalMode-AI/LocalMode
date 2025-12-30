/**
 * Fill-Mask Functions
 *
 * Function-first API for masked language modeling.
 *
 * @packageDocumentation
 */

import type {
  FillMaskModel,
  FillMaskOptions,
  FillMaskResult,
  FillMaskManyOptions,
  FillMaskManyResult,
  FillMaskModelFactory,
} from './types.js';

// Global provider for string model ID resolution
let globalFillMaskProvider: FillMaskModelFactory | null = null;

/**
 * Set the global fill-mask provider for string model ID resolution.
 *
 * @param provider - Factory function to create fill-mask models from string IDs
 */
export function setGlobalFillMaskProvider(provider: FillMaskModelFactory | null): void {
  globalFillMaskProvider = provider;
}

/**
 * Resolve a model from string ID or return the model object.
 */
function resolveModel(modelOrId: FillMaskModel | string): FillMaskModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalFillMaskProvider) {
    throw new Error(
      'No global fill-mask provider configured. ' +
        'Either pass a FillMaskModel object or call setGlobalFillMaskProvider() first.'
    );
  }

  return globalFillMaskProvider(modelOrId);
}

/**
 * Fill in a masked token using a fill-mask model.
 *
 * @param options - Fill-mask options including model, text, and number of predictions
 * @returns Promise with predictions and usage information
 *
 * @example Basic usage
 * ```ts
 * import { fillMask } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { predictions, usage } = await fillMask({
 *   model: transformers.fillMask('Xenova/bert-base-uncased'),
 *   text: 'The capital of France is [MASK].',
 *   topK: 5,
 * });
 *
 * console.log(predictions[0].token); // "paris"
 * console.log(predictions[0].score); // 0.95
 * console.log(`Completed in ${usage.durationMs}ms`);
 * ```
 *
 * @example Autocomplete
 * ```ts
 * const { predictions } = await fillMask({
 *   model: transformers.fillMask('Xenova/bert-base-uncased'),
 *   text: 'I want to eat [MASK] for dinner.',
 *   topK: 10,
 * });
 *
 * const suggestions = predictions.map(p => p.token);
 * ```
 *
 * @throws {Error} If fill-mask fails
 */
export async function fillMask(options: FillMaskOptions): Promise<FillMaskResult> {
  const {
    model: modelOrId,
    text,
    topK = 5,
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

      const result = await model.doFillMask({
        texts: [text],
        topK,
        abortSignal,
        providerOptions,
      });

      const durationMs = performance.now() - startTime;

      return {
        predictions: result.results[0],
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

  throw lastError || new Error('Fill-mask failed');
}

/**
 * Fill in masked tokens for multiple texts.
 *
 * @param options - Fill-mask options including model and texts
 * @returns Promise with predictions for each text
 *
 * @example
 * ```ts
 * const { results } = await fillMaskMany({
 *   model: transformers.fillMask('Xenova/bert-base-uncased'),
 *   texts: [
 *     'The [MASK] is blue.',
 *     'I love [MASK] music.',
 *   ],
 *   topK: 3,
 * });
 *
 * console.log(results[0][0].token); // "sky"
 * console.log(results[1][0].token); // "rock"
 * ```
 */
export async function fillMaskMany(options: FillMaskManyOptions): Promise<FillMaskManyResult> {
  const {
    model: modelOrId,
    texts,
    topK = 5,
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

      const result = await model.doFillMask({
        texts,
        topK,
        abortSignal,
        providerOptions,
      });

      const durationMs = performance.now() - startTime;

      return {
        results: result.results,
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

  throw lastError || new Error('Fill-mask failed');
}

