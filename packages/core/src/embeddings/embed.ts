/**
 * Embedding Functions
 *
 * Core embed(), embedMany(), and streamEmbedMany() functions.
 * These functions accept EmbeddingModel interface - implementations come from provider packages.
 *
 * @packageDocumentation
 */

import type {
  EmbeddingModel,
  EmbedOptions,
  EmbedResult,
  EmbedManyOptions,
  EmbedManyResult,
  StreamEmbedManyOptions,
  StreamEmbedResult,
} from './types.js';

// Re-export for completeness (EmbedProgress is used in StreamEmbedManyOptions.onBatch)
export type { EmbedProgress } from './types.js';

// Global provider registry for string model ID resolution
let globalProviderRegistry: GlobalProviderRegistry | null = null;

interface GlobalProviderRegistry {
  resolve(id: string): EmbeddingModel;
}

/**
 * Set the global provider registry for string model ID resolution.
 * Call this once at app initialization.
 *
 * @example
 * ```ts
 * import { setGlobalEmbeddingProvider } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * setGlobalEmbeddingProvider({
 *   transformers,
 * });
 *
 * // Now string model IDs work
 * const { embedding } = await embed({
 *   model: 'transformers:Xenova/all-MiniLM-L6-v2',
 *   value: 'Hello',
 * });
 * ```
 */
export function setGlobalEmbeddingProvider(
  providers: Record<string, { embedding: (modelId: string) => EmbeddingModel }>,
  options?: { separator?: string }
): void {
  const separator = options?.separator ?? ':';

  globalProviderRegistry = {
    resolve(id: string): EmbeddingModel {
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

      return provider.embedding(modelId);
    },
  };
}

/**
 * Resolve a model from string ID or return the model object as-is.
 */
function resolveModel(modelOrId: EmbeddingModel | string): EmbeddingModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalProviderRegistry) {
    throw new Error(
      'No global provider configured. Call setGlobalEmbeddingProvider() first, or pass a model object instead of a string.'
    );
  }

  return globalProviderRegistry.resolve(modelOrId);
}

/**
 * Embed a single value using the specified model.
 *
 * This function is in @localmode/core - model implementations are in provider packages.
 *
 * @param options - Embedding options
 * @returns Promise with embedding, usage, and response information
 *
 * @example Basic usage
 * ```ts
 * import { embed } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { embedding, usage, response } = await embed({
 *   model: transformers.embedding('Xenova/all-MiniLM-L6-v2'),
 *   value: 'Hello world',
 * });
 *
 * console.log(embedding.length); // 384
 * console.log(usage.tokens);     // 3
 * ```
 *
 * @example With string model ID (requires global provider setup)
 * ```ts
 * const { embedding } = await embed({
 *   model: 'transformers:Xenova/all-MiniLM-L6-v2',
 *   value: 'Hello world',
 * });
 * ```
 *
 * @example With AbortSignal
 * ```ts
 * const controller = new AbortController();
 * setTimeout(() => controller.abort(), 5000);
 *
 * const { embedding } = await embed({
 *   model: transformers.embedding('Xenova/all-MiniLM-L6-v2'),
 *   value: 'Hello world',
 *   abortSignal: controller.signal,
 * });
 * ```
 *
 * @throws {Error} If embedding fails after all retries
 * @throws {Error} If aborted via AbortSignal
 *
 * @see {@link embedMany} for batch embedding
 * @see {@link semanticSearch} for embedding + search
 */
export async function embed(options: EmbedOptions): Promise<EmbedResult> {
  const {
    model: modelOrId,
    value,
    abortSignal,
    maxRetries = 2,
    headers,
    providerOptions,
  } = options;

  // Resolve string model ID to model object
  const model = resolveModel(modelOrId);

  // Check for cancellation before starting
  abortSignal?.throwIfAborted();

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check before each retry
    abortSignal?.throwIfAborted();

    try {
      const result = await model.doEmbed({
        values: [value],
        abortSignal,
        headers,
        providerOptions,
      });

      return {
        embedding: result.embeddings[0],
        usage: result.usage,
        response: result.response,
      };
    } catch (error) {
      lastError = error as Error;

      // Don't retry if aborted
      if (abortSignal?.aborted) {
        throw new Error('Embedding was cancelled', { cause: lastError });
      }

      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }

      // TODO: Add exponential backoff delay here if needed
    }
  }

  throw new Error(`Embedding failed after ${maxRetries + 1} attempts`, {
    cause: lastError,
  });
}

/**
 * Embed multiple values using the specified model.
 *
 * Batches requests if the model has maxEmbeddingsPerCall limit.
 *
 * @param options - Embedding options
 * @returns Promise with embeddings array, usage, and response information
 *
 * @example
 * ```ts
 * import { embedMany } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { embeddings, usage } = await embedMany({
 *   model: transformers.embedding('Xenova/all-MiniLM-L6-v2'),
 *   values: ['Hello', 'World', 'Test'],
 * });
 *
 * console.log(embeddings.length); // 3
 * console.log(embeddings[0].length); // 384
 * ```
 *
 * @see {@link embed} for single value embedding
 * @see {@link streamEmbedMany} for streaming with progress
 */
export async function embedMany(options: EmbedManyOptions): Promise<EmbedManyResult> {
  const {
    model: modelOrId,
    values,
    abortSignal,
    maxRetries = 2,
    headers,
    providerOptions,
  } = options;

  // Resolve string model ID to model object
  const model = resolveModel(modelOrId);

  // Check for cancellation before starting
  abortSignal?.throwIfAborted();

  // If no max limit or all values fit in one call
  if (!model.maxEmbeddingsPerCall || values.length <= model.maxEmbeddingsPerCall) {
    const result = await embedWithRetry(model, values, {
      abortSignal,
      maxRetries,
      headers,
      providerOptions,
    });

    return {
      embeddings: result.embeddings,
      usage: result.usage,
      response: result.response,
    };
  }

  // Batch processing for large value arrays
  const allEmbeddings: Float32Array[] = [];
  let totalTokens = 0;
  let lastResponse = { modelId: model.modelId, timestamp: new Date() };

  const batchSize = model.maxEmbeddingsPerCall;

  for (let i = 0; i < values.length; i += batchSize) {
    // Check for cancellation before each batch
    abortSignal?.throwIfAborted();

    const batch = values.slice(i, i + batchSize);
    const result = await embedWithRetry(model, batch, {
      abortSignal,
      maxRetries,
      headers,
      providerOptions,
    });

    allEmbeddings.push(...result.embeddings);
    totalTokens += result.usage.tokens;
    lastResponse = result.response;
  }

  return {
    embeddings: allEmbeddings,
    usage: { tokens: totalTokens },
    response: lastResponse,
  };
}

/**
 * Stream embeddings for large value arrays with progress tracking.
 *
 * Yields embeddings one at a time as they're generated, allowing
 * for progress tracking and early processing.
 *
 * @param options - Streaming embed options
 * @yields StreamEmbedResult with embedding and index
 *
 * @example
 * ```ts
 * import { streamEmbedMany } from '@localmode/core';
 *
 * for await (const { embedding, index } of streamEmbedMany({
 *   model: transformers.embedding('Xenova/all-MiniLM-L6-v2'),
 *   values: largeTextArray,
 *   batchSize: 32,
 *   onBatch: ({ index, count, total }) => {
 *     console.log(`Progress: ${index + count}/${total}`);
 *   },
 * })) {
 *   await db.add({ id: `doc-${index}`, vector: embedding });
 * }
 * ```
 *
 * @see {@link embedMany} for non-streaming batch embedding
 */
export async function* streamEmbedMany(
  options: StreamEmbedManyOptions
): AsyncGenerator<StreamEmbedResult> {
  const {
    model: modelOrId,
    values,
    batchSize = 32,
    abortSignal,
    maxRetries = 2,
    headers,
    providerOptions,
    onBatch,
  } = options;

  // Resolve string model ID to model object
  const model = resolveModel(modelOrId);

  // Check for cancellation before starting
  abortSignal?.throwIfAborted();

  const total = values.length;

  for (let i = 0; i < values.length; i += batchSize) {
    // Check for cancellation before each batch
    abortSignal?.throwIfAborted();

    const batch = values.slice(i, i + batchSize);
    const result = await embedWithRetry(model, batch, {
      abortSignal,
      maxRetries,
      headers,
      providerOptions,
    });

    // Yield each embedding individually
    for (let j = 0; j < result.embeddings.length; j++) {
      yield {
        embedding: result.embeddings[j],
        index: i + j,
      };
    }

    // Call progress callback
    onBatch?.({
      index: i,
      count: result.embeddings.length,
      total,
      usage: result.usage,
    });
  }
}

/**
 * Helper function to embed with retry logic.
 */
async function embedWithRetry(
  model: EmbeddingModel,
  values: string[],
  options: {
    abortSignal?: AbortSignal;
    maxRetries: number;
    headers?: Record<string, string>;
    providerOptions?: Record<string, Record<string, unknown>>;
  }
): Promise<{
  embeddings: Float32Array[];
  usage: { tokens: number };
  response: { id?: string; modelId: string; timestamp: Date };
}> {
  const { abortSignal, maxRetries, headers, providerOptions } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    abortSignal?.throwIfAborted();

    try {
      return await model.doEmbed({
        values,
        abortSignal,
        headers,
        providerOptions,
      });
    } catch (error) {
      lastError = error as Error;

      if (abortSignal?.aborted) {
        throw new Error('Embedding was cancelled', { cause: lastError });
      }

      if (attempt === maxRetries) {
        break;
      }
    }
  }

  throw new Error(`Embedding failed after ${maxRetries + 1} attempts`, {
    cause: lastError,
  });
}
