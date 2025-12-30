/**
 * Named Entity Recognition (NER) Functions
 *
 * Core extractEntities() and extractEntitiesMany() functions.
 * These functions accept NERModel interface - implementations come from provider packages.
 *
 * @packageDocumentation
 */

import type {
  NERModel,
  ExtractEntitiesOptions,
  ExtractEntitiesResult,
  ExtractEntitiesManyOptions,
  ExtractEntitiesManyResult,
  NERResultItem,
  NERUsage,
} from './types.js';

// Global provider registry for string model ID resolution
let globalNERRegistry: GlobalNERRegistry | null = null;

interface GlobalNERRegistry {
  resolve(id: string): NERModel;
}

/**
 * Set the global NER provider registry for string model ID resolution.
 * Call this once at app initialization.
 *
 * @example
 * ```ts
 * import { setGlobalNERProvider } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * setGlobalNERProvider({
 *   transformers,
 * });
 *
 * // Now string model IDs work
 * const { entities } = await extractEntities({
 *   model: 'transformers:Xenova/bert-base-NER',
 *   text: 'John works at Microsoft',
 * });
 * ```
 */
export function setGlobalNERProvider(
  providers: Record<string, { ner: (modelId: string) => NERModel }>,
  options?: { separator?: string }
): void {
  const separator = options?.separator ?? ':';

  globalNERRegistry = {
    resolve(id: string): NERModel {
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

      return provider.ner(modelId);
    },
  };
}

/**
 * Resolve a NER model from string ID or return the model object as-is.
 */
function resolveNERModel(modelOrId: NERModel | string): NERModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalNERRegistry) {
    throw new Error(
      'No global provider configured. Call setGlobalNERProvider() first, or pass a model object instead of a string.'
    );
  }

  return globalNERRegistry.resolve(modelOrId);
}

/**
 * Extract named entities from a single text.
 *
 * Named Entity Recognition identifies and classifies named entities in text,
 * such as people, organizations, locations, dates, etc.
 *
 * This function is in @localmode/core - model implementations are in provider packages.
 *
 * @param options - NER options
 * @returns Promise with entities, usage, and response information
 *
 * @example Basic usage
 * ```ts
 * import { extractEntities } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { entities, usage } = await extractEntities({
 *   model: transformers.ner('Xenova/bert-base-NER'),
 *   text: 'John works at Microsoft in Seattle',
 * });
 *
 * // entities: [
 * //   { text: 'John', type: 'PERSON', start: 0, end: 4, score: 0.99 },
 * //   { text: 'Microsoft', type: 'ORG', start: 14, end: 23, score: 0.98 },
 * //   { text: 'Seattle', type: 'LOC', start: 27, end: 34, score: 0.97 }
 * // ]
 * ```
 *
 * @example With string model ID (requires global provider setup)
 * ```ts
 * const { entities } = await extractEntities({
 *   model: 'transformers:Xenova/bert-base-NER',
 *   text: 'Apple announced new products today',
 * });
 * ```
 *
 * @example With AbortSignal
 * ```ts
 * const controller = new AbortController();
 * setTimeout(() => controller.abort(), 5000);
 *
 * const { entities } = await extractEntities({
 *   model: transformers.ner('Xenova/bert-base-NER'),
 *   text: 'The CEO of Tesla is Elon Musk',
 *   abortSignal: controller.signal,
 * });
 * ```
 *
 * @throws {Error} If extraction fails after all retries
 * @throws {Error} If aborted via AbortSignal
 *
 * @see {@link extractEntitiesMany} for batch entity extraction
 */
export async function extractEntities(
  options: ExtractEntitiesOptions
): Promise<ExtractEntitiesResult> {
  const {
    model: modelOrId,
    text,
    abortSignal,
    maxRetries = 2,
    headers,
    providerOptions,
  } = options;

  // Resolve string model ID to model object
  const model = resolveNERModel(modelOrId);

  // Check for cancellation before starting
  abortSignal?.throwIfAborted();

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check before each retry
    abortSignal?.throwIfAborted();

    try {
      const result = await model.doExtract({
        texts: [text],
        abortSignal,
        headers,
        providerOptions,
      });

      const item = result.results[0];

      return {
        entities: item.entities,
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
        throw new Error('Entity extraction was cancelled', { cause: lastError });
      }

      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }
    }
  }

  throw new Error(`Entity extraction failed after ${maxRetries + 1} attempts`, {
    cause: lastError,
  });
}

/**
 * Extract named entities from multiple texts.
 *
 * @param options - NER options
 * @returns Promise with results array, usage, and response information
 *
 * @example
 * ```ts
 * import { extractEntitiesMany } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { results, usage } = await extractEntitiesMany({
 *   model: transformers.ner('Xenova/bert-base-NER'),
 *   texts: [
 *     'John works at Microsoft',
 *     'Apple is based in Cupertino',
 *     'The Eiffel Tower is in Paris',
 *   ],
 * });
 *
 * results.forEach((r, i) => {
 *   console.log(`Text ${i}:`, r.entities.map(e => `${e.text} (${e.type})`));
 * });
 * ```
 *
 * @see {@link extractEntities} for single text entity extraction
 */
export async function extractEntitiesMany(
  options: ExtractEntitiesManyOptions
): Promise<ExtractEntitiesManyResult> {
  const {
    model: modelOrId,
    texts,
    abortSignal,
    maxRetries = 2,
    headers,
    providerOptions,
  } = options;

  // Resolve string model ID to model object
  const model = resolveNERModel(modelOrId);

  // Check for cancellation before starting
  abortSignal?.throwIfAborted();

  const result = await extractWithRetry(model, texts, {
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
 * Helper function to extract entities with retry logic.
 */
async function extractWithRetry(
  model: NERModel,
  texts: string[],
  options: {
    abortSignal?: AbortSignal;
    maxRetries: number;
    headers?: Record<string, string>;
    providerOptions?: Record<string, Record<string, unknown>>;
  }
): Promise<{
  results: NERResultItem[];
  usage: NERUsage;
}> {
  const { abortSignal, maxRetries, headers, providerOptions } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    abortSignal?.throwIfAborted();

    try {
      return await model.doExtract({
        texts,
        abortSignal,
        headers,
        providerOptions,
      });
    } catch (error) {
      lastError = error as Error;

      if (abortSignal?.aborted) {
        throw new Error('Entity extraction was cancelled', { cause: lastError });
      }

      if (attempt === maxRetries) {
        break;
      }
    }
  }

  throw new Error(`Entity extraction failed after ${maxRetries + 1} attempts`, {
    cause: lastError,
  });
}

