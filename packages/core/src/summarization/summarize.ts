/**
 * Summarization Functions
 *
 * Function-first API for summarizing text.
 *
 * @packageDocumentation
 */

import type {
  SummarizationModel,
  SummarizeOptions,
  SummarizeResult,
  SummarizeManyOptions,
  SummarizeManyResult,
  SummarizationModelFactory,
} from './types.js';

// Global provider for string model ID resolution
let globalSummarizationProvider: SummarizationModelFactory | null = null;

/**
 * Set the global summarization provider for string model ID resolution.
 *
 * @param provider - Factory function to create summarization models from string IDs
 */
export function setGlobalSummarizationProvider(provider: SummarizationModelFactory | null): void {
  globalSummarizationProvider = provider;
}

/**
 * Resolve a model from string ID or return the model object.
 */
function resolveModel(modelOrId: SummarizationModel | string): SummarizationModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalSummarizationProvider) {
    throw new Error(
      'No global summarization provider configured. ' +
        'Either pass a SummarizationModel object or call setGlobalSummarizationProvider() first.'
    );
  }

  return globalSummarizationProvider(modelOrId);
}

/**
 * Summarize text using a summarization model.
 *
 * @param options - Summarization options including model, text, and length constraints
 * @returns Promise with summary and usage information
 *
 * @example Basic usage
 * ```ts
 * import { summarize } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { summary, usage } = await summarize({
 *   model: transformers.summarizer('Xenova/distilbart-cnn-12-6'),
 *   text: longArticle,
 *   maxLength: 100,
 * });
 *
 * console.log(summary);
 * console.log(`Summarized in ${usage.durationMs}ms`);
 * ```
 *
 * @throws {Error} If summarization fails
 */
export async function summarize(options: SummarizeOptions): Promise<SummarizeResult> {
  const {
    model: modelOrId,
    text,
    maxLength = 150,
    minLength = 30,
    mode,
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
    abortSignal?.throwIfAborted();

    try {
      const startTime = performance.now();

      const result = await model.doSummarize({
        texts: [text],
        maxLength,
        minLength,
        mode,
        abortSignal,
        providerOptions,
      });

      const durationMs = performance.now() - startTime;

      return {
        summary: result.summaries[0],
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

  throw lastError || new Error('Summarization failed');
}

/**
 * Summarize multiple texts using a summarization model.
 *
 * @param options - Summarization options including model and texts
 * @returns Promise with summaries and usage information
 *
 * @example
 * ```ts
 * const { summaries } = await summarizeMany({
 *   model: transformers.summarizer('Xenova/distilbart-cnn-12-6'),
 *   texts: [article1, article2, article3],
 *   maxLength: 100,
 * });
 * ```
 */
export async function summarizeMany(options: SummarizeManyOptions): Promise<SummarizeManyResult> {
  const {
    model: modelOrId,
    texts,
    maxLength = 150,
    minLength = 30,
    mode,
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

      const result = await model.doSummarize({
        texts,
        maxLength,
        minLength,
        mode,
        abortSignal,
        providerOptions,
      });

      const durationMs = performance.now() - startTime;

      return {
        summaries: result.summaries,
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

  throw lastError || new Error('Summarization failed');
}

