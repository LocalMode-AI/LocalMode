/**
 * Classification Functions
 *
 * Core classify(), classifyMany(), and classifyZeroShot() functions.
 * These functions accept ClassificationModel interface - implementations come from provider packages.
 *
 * @packageDocumentation
 */

import type {
  ClassificationModel,
  ZeroShotClassificationModel,
  ClassifyOptions,
  ClassifyResult,
  ClassifyManyOptions,
  ClassifyManyResult,
  ClassifyZeroShotOptions,
  ClassifyZeroShotResult,
  ClassificationResultItem,
  ClassificationUsage,
} from './types.js';

// Global provider registry for string model ID resolution
let globalClassificationRegistry: GlobalClassificationRegistry | null = null;

interface GlobalClassificationRegistry {
  resolveClassifier(id: string): ClassificationModel;
  resolveZeroShot(id: string): ZeroShotClassificationModel;
}

/**
 * Set the global classification provider registry for string model ID resolution.
 * Call this once at app initialization.
 *
 * @example
 * ```ts
 * import { setGlobalClassificationProvider } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * setGlobalClassificationProvider({
 *   transformers,
 * });
 *
 * // Now string model IDs work
 * const { label } = await classify({
 *   model: 'transformers:Xenova/distilbert-sst-2',
 *   text: 'I love this!',
 * });
 * ```
 */
export function setGlobalClassificationProvider(
  providers: Record<
    string,
    {
      classifier: (modelId: string) => ClassificationModel;
      zeroShot: (modelId: string) => ZeroShotClassificationModel;
    }
  >,
  options?: { separator?: string }
): void {
  const separator = options?.separator ?? ':';

  globalClassificationRegistry = {
    resolveClassifier(id: string): ClassificationModel {
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

      return provider.classifier(modelId);
    },

    resolveZeroShot(id: string): ZeroShotClassificationModel {
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

      return provider.zeroShot(modelId);
    },
  };
}

/**
 * Resolve a classification model from string ID or return the model object as-is.
 */
function resolveClassificationModel(modelOrId: ClassificationModel | string): ClassificationModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalClassificationRegistry) {
    throw new Error(
      'No global provider configured. Call setGlobalClassificationProvider() first, or pass a model object instead of a string.'
    );
  }

  return globalClassificationRegistry.resolveClassifier(modelOrId);
}

/**
 * Resolve a zero-shot model from string ID or return the model object as-is.
 */
function resolveZeroShotModel(
  modelOrId: ZeroShotClassificationModel | string
): ZeroShotClassificationModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalClassificationRegistry) {
    throw new Error(
      'No global provider configured. Call setGlobalClassificationProvider() first, or pass a model object instead of a string.'
    );
  }

  return globalClassificationRegistry.resolveZeroShot(modelOrId);
}

/**
 * Classify a single text using the specified model.
 *
 * This function is in @localmode/core - model implementations are in provider packages.
 *
 * @param options - Classification options
 * @returns Promise with label, score, usage, and response information
 *
 * @example Basic usage
 * ```ts
 * import { classify } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { label, score, usage } = await classify({
 *   model: transformers.classifier('Xenova/distilbert-base-uncased-finetuned-sst-2-english'),
 *   text: 'I love this product!',
 * });
 *
 * console.log(label); // 'POSITIVE'
 * console.log(score); // 0.9998
 * ```
 *
 * @example With string model ID (requires global provider setup)
 * ```ts
 * const { label } = await classify({
 *   model: 'transformers:Xenova/distilbert-sst-2',
 *   text: 'This is terrible!',
 * });
 * ```
 *
 * @example With AbortSignal
 * ```ts
 * const controller = new AbortController();
 * setTimeout(() => controller.abort(), 5000);
 *
 * const { label } = await classify({
 *   model: transformers.classifier('Xenova/distilbert-sst-2'),
 *   text: 'Hello world',
 *   abortSignal: controller.signal,
 * });
 * ```
 *
 * @throws {Error} If classification fails after all retries
 * @throws {Error} If aborted via AbortSignal
 *
 * @see {@link classifyMany} for batch classification
 * @see {@link classifyZeroShot} for zero-shot classification
 */
export async function classify(options: ClassifyOptions): Promise<ClassifyResult> {
  const { model: modelOrId, text, abortSignal, maxRetries = 2, headers, providerOptions } = options;

  // Resolve string model ID to model object
  const model = resolveClassificationModel(modelOrId);

  // Check for cancellation before starting
  abortSignal?.throwIfAborted();

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check before each retry
    abortSignal?.throwIfAborted();

    try {
      const result = await model.doClassify({
        texts: [text],
        abortSignal,
        headers,
        providerOptions,
      });

      const item = result.results[0];

      return {
        label: item.label,
        score: item.score,
        allScores: item.allScores,
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
        throw new Error('Classification was cancelled', { cause: lastError });
      }

      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }
    }
  }

  throw new Error(`Classification failed after ${maxRetries + 1} attempts`, {
    cause: lastError,
  });
}

/**
 * Classify multiple texts using the specified model.
 *
 * @param options - Classification options
 * @returns Promise with results array, usage, and response information
 *
 * @example
 * ```ts
 * import { classifyMany } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { results, usage } = await classifyMany({
 *   model: transformers.classifier('Xenova/distilbert-sst-2'),
 *   texts: ['I love this!', 'This is terrible!', 'It is okay.'],
 * });
 *
 * results.forEach((r, i) => {
 *   console.log(`Text ${i}: ${r.label} (${r.score.toFixed(2)})`);
 * });
 * ```
 *
 * @see {@link classify} for single text classification
 */
export async function classifyMany(options: ClassifyManyOptions): Promise<ClassifyManyResult> {
  const {
    model: modelOrId,
    texts,
    abortSignal,
    maxRetries = 2,
    headers,
    providerOptions,
  } = options;

  // Resolve string model ID to model object
  const model = resolveClassificationModel(modelOrId);

  // Check for cancellation before starting
  abortSignal?.throwIfAborted();

  const result = await classifyWithRetry(model, texts, {
    abortSignal,
    maxRetries,
    headers,
    providerOptions,
  });

  return {
    results: result.results,
    usage: result.usage,
    response: {
      modelId: model.modelId,
      timestamp: new Date(),
    },
  };
}

/**
 * Classify text into arbitrary labels using zero-shot classification.
 *
 * Zero-shot classification allows you to classify text into labels that
 * the model wasn't explicitly trained on.
 *
 * @param options - Zero-shot classification options
 * @returns Promise with labels, scores, usage, and response information
 *
 * @example
 * ```ts
 * import { classifyZeroShot } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { labels, scores } = await classifyZeroShot({
 *   model: transformers.zeroShot('Xenova/bart-large-mnli'),
 *   text: 'I just bought a new Tesla Model 3',
 *   candidateLabels: ['automotive', 'technology', 'finance', 'sports'],
 * });
 *
 * console.log(labels[0]); // 'automotive'
 * console.log(scores[0]); // 0.87
 * ```
 *
 * @example With multi-label classification
 * ```ts
 * const { labels, scores } = await classifyZeroShot({
 *   model: transformers.zeroShot('Xenova/bart-large-mnli'),
 *   text: 'The new iPhone uses advanced AI for photography',
 *   candidateLabels: ['technology', 'photography', 'smartphones'],
 *   multiLabel: true,
 * });
 * // Multiple labels can have high scores
 * ```
 *
 * @see {@link classify} for standard classification with fixed labels
 */
export async function classifyZeroShot(
  options: ClassifyZeroShotOptions
): Promise<ClassifyZeroShotResult> {
  const {
    model: modelOrId,
    text,
    candidateLabels,
    multiLabel,
    abortSignal,
    maxRetries = 2,
    headers,
    providerOptions,
  } = options;

  // Resolve string model ID to model object
  const model = resolveZeroShotModel(modelOrId);

  // Check for cancellation before starting
  abortSignal?.throwIfAborted();

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check before each retry
    abortSignal?.throwIfAborted();

    try {
      const result = await model.doClassifyZeroShot({
        texts: [text],
        candidateLabels,
        multiLabel,
        abortSignal,
        headers,
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
        throw new Error('Zero-shot classification was cancelled', { cause: lastError });
      }

      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }
    }
  }

  throw new Error(`Zero-shot classification failed after ${maxRetries + 1} attempts`, {
    cause: lastError,
  });
}

/**
 * Helper function to classify with retry logic.
 */
async function classifyWithRetry(
  model: ClassificationModel,
  texts: string[],
  options: {
    abortSignal?: AbortSignal;
    maxRetries: number;
    headers?: Record<string, string>;
    providerOptions?: Record<string, Record<string, unknown>>;
  }
): Promise<{
  results: ClassificationResultItem[];
  usage: ClassificationUsage;
}> {
  const { abortSignal, maxRetries, headers, providerOptions } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    abortSignal?.throwIfAborted();

    try {
      return await model.doClassify({
        texts,
        abortSignal,
        headers,
        providerOptions,
      });
    } catch (error) {
      lastError = error as Error;

      if (abortSignal?.aborted) {
        throw new Error('Classification was cancelled', { cause: lastError });
      }

      if (attempt === maxRetries) {
        break;
      }
    }
  }

  throw new Error(`Classification failed after ${maxRetries + 1} attempts`, {
    cause: lastError,
  });
}
