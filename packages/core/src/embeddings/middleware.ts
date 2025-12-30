/**
 * Embedding Model Middleware
 *
 * Wrap embedding models with middleware for caching, logging, retry, etc.
 *
 * @packageDocumentation
 */

import type {
  EmbeddingModel,
  EmbeddingModelMiddleware,
  DoEmbedOptions,
  DoEmbedResult,
} from './types.js';

/**
 * Wrap an embedding model with middleware.
 *
 * Middleware can transform parameters before embedding and wrap the
 * embed call for caching, logging, retry, rate limiting, etc.
 *
 * @param options - The model and middleware to apply
 * @returns A wrapped embedding model
 *
 * @example Caching middleware
 * ```ts
 * const cache = new Map<string, Float32Array>();
 *
 * const cachingMiddleware: EmbeddingModelMiddleware = {
 *   wrapEmbed: async ({ doEmbed, values }) => {
 *     const key = values.join('|||');
 *     const cached = cache.get(key);
 *     if (cached) {
 *       return { embeddings: [cached], usage: { tokens: 0 }, response: { modelId: 'cached', timestamp: new Date() } };
 *     }
 *     const result = await doEmbed();
 *     cache.set(key, result.embeddings[0]);
 *     return result;
 *   },
 * };
 *
 * const cachedModel = wrapEmbeddingModel({
 *   model: transformers.embedding('Xenova/all-MiniLM-L6-v2'),
 *   middleware: cachingMiddleware,
 * });
 * ```
 *
 * @example Logging middleware
 * ```ts
 * const loggingMiddleware: EmbeddingModelMiddleware = {
 *   wrapEmbed: async ({ doEmbed, values, model }) => {
 *     console.log(`Embedding ${values.length} values with ${model.modelId}`);
 *     const start = Date.now();
 *     const result = await doEmbed();
 *     console.log(`Completed in ${Date.now() - start}ms`);
 *     return result;
 *   },
 * };
 * ```
 *
 * @example PII redaction middleware
 * ```ts
 * const piiMiddleware: EmbeddingModelMiddleware = {
 *   transformParams: ({ values }) => ({
 *     values: values.map(v => redactPII(v)),
 *   }),
 * };
 * ```
 *
 * @see {@link EmbeddingModelMiddleware} for middleware interface
 */
export function wrapEmbeddingModel(options: {
  model: EmbeddingModel;
  middleware: EmbeddingModelMiddleware;
}): EmbeddingModel {
  const { model, middleware } = options;

  return {
    // Forward all readonly properties
    modelId: model.modelId,
    provider: model.provider,
    dimensions: model.dimensions,
    maxEmbeddingsPerCall: model.maxEmbeddingsPerCall,
    supportsParallelCalls: model.supportsParallelCalls,

    // Wrap doEmbed with middleware
    async doEmbed(embedOptions: DoEmbedOptions): Promise<DoEmbedResult> {
      let { values } = embedOptions;
      const { abortSignal, headers, providerOptions } = embedOptions;

      // Apply parameter transformation if provided
      if (middleware.transformParams) {
        const transformed = await middleware.transformParams({ values });
        values = transformed.values;
      }

      // Define the actual embed function
      const doEmbed = () =>
        model.doEmbed({
          values,
          abortSignal,
          headers,
          providerOptions,
        });

      // Apply wrap if provided, otherwise just call doEmbed
      if (middleware.wrapEmbed) {
        return middleware.wrapEmbed({
          doEmbed,
          values,
          model,
        });
      }

      return doEmbed();
    },
  };
}

/**
 * Compose multiple middleware into a single middleware.
 *
 * Middleware are applied in order: first middleware's transformParams runs first,
 * but first middleware's wrapEmbed wraps the outermost layer.
 *
 * @param middlewares - Array of middleware to compose
 * @returns A single composed middleware
 *
 * @example
 * ```ts
 * const composed = composeEmbeddingMiddleware([
 *   piiRedactionMiddleware,
 *   cachingMiddleware,
 *   loggingMiddleware,
 * ]);
 *
 * const model = wrapEmbeddingModel({
 *   model: baseModel,
 *   middleware: composed,
 * });
 * ```
 */
export function composeEmbeddingMiddleware(
  middlewares: EmbeddingModelMiddleware[]
): EmbeddingModelMiddleware {
  if (middlewares.length === 0) {
    return {};
  }

  if (middlewares.length === 1) {
    return middlewares[0];
  }

  return {
    // Chain transformParams: each middleware transforms in order
    transformParams: async (params) => {
      let current = params;
      for (const mw of middlewares) {
        if (mw.transformParams) {
          current = await mw.transformParams(current);
        }
      }
      return current;
    },

    // Chain wrapEmbed: first middleware wraps outermost
    wrapEmbed: async ({ doEmbed, values, model }) => {
      // Build the chain from inside out
      let currentDoEmbed = doEmbed;

      // Reverse so first middleware wraps outermost
      const reversed = [...middlewares].reverse();

      for (const mw of reversed) {
        if (mw.wrapEmbed) {
          const prevDoEmbed = currentDoEmbed;
          currentDoEmbed = () =>
            mw.wrapEmbed!({
              doEmbed: prevDoEmbed,
              values,
              model,
            });
        }
      }

      return currentDoEmbed();
    },
  };
}

