/**
 * Language Model Middleware
 *
 * Wrap language models with middleware for caching, logging, retry, etc.
 * Mirrors the embedding model middleware pattern in embeddings/middleware.ts.
 *
 * @packageDocumentation
 */

import type {
  LanguageModel,
  LanguageModelMiddleware,
  DoGenerateOptions,
  DoGenerateResult,
  DoStreamOptions,
  StreamChunk,
} from './types.js';

/**
 * Wrap a language model with middleware.
 *
 * Middleware can transform parameters before generation, wrap the
 * generate call for caching, logging, retry, rate limiting, etc.,
 * and wrap the streaming call similarly.
 *
 * @param options - The model and middleware to apply
 * @returns A wrapped language model
 *
 * @example Caching middleware
 * ```ts
 * const cache = new Map<string, DoGenerateResult>();
 *
 * const cachingMiddleware: LanguageModelMiddleware = {
 *   wrapGenerate: async ({ doGenerate, prompt }) => {
 *     const cached = cache.get(prompt);
 *     if (cached) return cached;
 *     const result = await doGenerate();
 *     cache.set(prompt, result);
 *     return result;
 *   },
 * };
 *
 * const cachedModel = wrapLanguageModel({
 *   model: webllm.languageModel('Llama-3.2-1B-Instruct-q4f16'),
 *   middleware: cachingMiddleware,
 * });
 * ```
 *
 * @example Logging middleware
 * ```ts
 * const loggingMiddleware: LanguageModelMiddleware = {
 *   wrapGenerate: async ({ doGenerate, prompt, model }) => {
 *     console.log(`Generating with ${model.modelId}: ${prompt.slice(0, 50)}`);
 *     const start = Date.now();
 *     const result = await doGenerate();
 *     console.log(`Completed in ${Date.now() - start}ms`);
 *     return result;
 *   },
 * };
 * ```
 *
 * @see {@link LanguageModelMiddleware} for middleware interface
 * @see {@link composeLanguageModelMiddleware} for composing multiple middleware
 */
export function wrapLanguageModel(options: {
  model: LanguageModel;
  middleware: LanguageModelMiddleware;
}): LanguageModel {
  const { model, middleware } = options;

  const wrapped: LanguageModel = {
    // Forward all readonly properties
    modelId: model.modelId,
    provider: model.provider,
    contextLength: model.contextLength,
    supportsVision: model.supportsVision,

    // Wrap doGenerate with middleware
    async doGenerate(generateOptions: DoGenerateOptions): Promise<DoGenerateResult> {
      let { prompt } = generateOptions;
      let { systemPrompt, messages } = generateOptions;
      const { maxTokens, temperature, topP, stopSequences, abortSignal, providerOptions } =
        generateOptions;

      // Apply parameter transformation if provided
      if (middleware.transformParams) {
        const transformed = await middleware.transformParams({ prompt, systemPrompt, messages });
        prompt = transformed.prompt;
        systemPrompt = transformed.systemPrompt;
        messages = transformed.messages;
      }

      // Define the actual generate function
      const doGenerate = () =>
        model.doGenerate({
          prompt,
          systemPrompt,
          messages,
          maxTokens,
          temperature,
          topP,
          stopSequences,
          abortSignal,
          providerOptions,
        });

      // Apply wrap if provided, otherwise just call doGenerate
      if (middleware.wrapGenerate) {
        return middleware.wrapGenerate({
          doGenerate,
          prompt,
          model,
        });
      }

      return doGenerate();
    },
  };

  // Handle doStream: only add if the model has it or the middleware provides wrapStream
  if (model.doStream || middleware.wrapStream) {
    wrapped.doStream = function doStream(streamOptions: DoStreamOptions): AsyncIterable<StreamChunk> {
      let { prompt } = streamOptions;
      let { systemPrompt, messages } = streamOptions;
      const { maxTokens, temperature, topP, stopSequences, abortSignal, providerOptions } =
        streamOptions;

      // We need to handle transformParams asynchronously within the async generator
      async function* streamWithMiddleware(): AsyncIterable<StreamChunk> {
        // Apply parameter transformation if provided
        if (middleware.transformParams) {
          const transformed = await middleware.transformParams({ prompt, systemPrompt, messages });
          prompt = transformed.prompt;
          systemPrompt = transformed.systemPrompt;
          messages = transformed.messages;
        }

        // Define the actual stream function
        const doStreamFn = (): AsyncIterable<StreamChunk> => {
          if (model.doStream) {
            return model.doStream({
              prompt,
              systemPrompt,
              messages,
              maxTokens,
              temperature,
              topP,
              stopSequences,
              abortSignal,
              providerOptions,
            });
          }

          // If base model doesn't support streaming, throw
          throw new Error(
            `Model ${model.modelId} does not support streaming. ` +
              'The middleware defines wrapStream but the base model has no doStream.'
          );
        };

        // Apply wrap if provided, otherwise just call doStream
        if (middleware.wrapStream) {
          yield* middleware.wrapStream({
            doStream: doStreamFn,
            prompt,
            model,
          });
        } else {
          yield* doStreamFn();
        }
      }

      return streamWithMiddleware();
    };
  }

  return wrapped;
}

/**
 * Compose multiple middleware into a single middleware.
 *
 * Middleware are applied in order: first middleware's transformParams runs first,
 * but first middleware's wrapGenerate/wrapStream wraps the outermost layer.
 *
 * @param middlewares - Array of middleware to compose
 * @returns A single composed middleware
 *
 * @example
 * ```ts
 * const composed = composeLanguageModelMiddleware([
 *   guardrailsMiddleware,
 *   cachingMiddleware,
 *   loggingMiddleware,
 * ]);
 *
 * const model = wrapLanguageModel({
 *   model: baseModel,
 *   middleware: composed,
 * });
 * ```
 */
export function composeLanguageModelMiddleware(
  middlewares: LanguageModelMiddleware[]
): LanguageModelMiddleware {
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

    // Chain wrapGenerate: first middleware wraps outermost
    wrapGenerate: async ({ doGenerate, prompt, model }) => {
      // Build the chain from inside out
      let currentDoGenerate = doGenerate;

      // Reverse so first middleware wraps outermost
      const reversed = [...middlewares].reverse();

      for (const mw of reversed) {
        if (mw.wrapGenerate) {
          const prevDoGenerate = currentDoGenerate;
          currentDoGenerate = () =>
            mw.wrapGenerate!({
              doGenerate: prevDoGenerate,
              prompt,
              model,
            });
        }
      }

      return currentDoGenerate();
    },

    // Chain wrapStream: first middleware wraps outermost
    wrapStream: ({ doStream, prompt, model }) => {
      // Build the chain from inside out
      let currentDoStream = doStream;

      // Reverse so first middleware wraps outermost
      const reversed = [...middlewares].reverse();

      for (const mw of reversed) {
        if (mw.wrapStream) {
          const prevDoStream = currentDoStream;
          currentDoStream = () =>
            mw.wrapStream!({
              doStream: prevDoStream,
              prompt,
              model,
            });
        }
      }

      return currentDoStream();
    },
  };
}
