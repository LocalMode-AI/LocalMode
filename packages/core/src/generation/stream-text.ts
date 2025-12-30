/**
 * Streaming Text Generation Function
 *
 * Function-first API for streaming text generation with language models.
 *
 * @packageDocumentation
 */

import type {
  LanguageModel,
  StreamTextOptions,
  StreamTextResult,
  StreamChunk,
  GenerationUsage,
  LanguageModelFactory,
} from './types.js';

// Global provider for string model ID resolution
let globalLanguageModelProvider: LanguageModelFactory | null = null;

/**
 * Set the global language model provider for string model ID resolution.
 * This is shared with generateText().
 */
export function setGlobalLanguageModelProviderForStream(
  provider: LanguageModelFactory | null
): void {
  globalLanguageModelProvider = provider;
}

/**
 * Resolve a model from string ID or return the model object.
 */
function resolveModel(modelOrId: LanguageModel | string): LanguageModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalLanguageModelProvider) {
    throw new Error(
      'No global language model provider configured. ' +
        'Either pass a LanguageModel object or call setGlobalLanguageModelProvider() first.'
    );
  }

  return globalLanguageModelProvider(modelOrId);
}

/**
 * Stream text generation using a language model.
 *
 * Returns an object with a stream property that can be iterated,
 * plus promises for the full text and usage information.
 *
 * @param options - Stream options including model, prompt, and parameters
 * @returns Object with stream, text promise, usage promise, and response metadata
 *
 * @example Basic streaming
 * ```ts
 * import { streamText } from '@localmode/core';
 * import { webllm } from '@localmode/webllm';
 *
 * const result = await streamText({
 *   model: webllm.languageModel('Llama-3.2-1B-Instruct-q4f16'),
 *   prompt: 'Write a story about a robot',
 *   maxTokens: 500,
 * });
 *
 * for await (const chunk of result.stream) {
 *   process.stdout.write(chunk.text);
 * }
 *
 * const fullText = await result.text;
 * const usage = await result.usage;
 * console.log(`\nGenerated ${usage.outputTokens} tokens`);
 * ```
 *
 * @example With onChunk callback
 * ```ts
 * const result = await streamText({
 *   model: webllm.languageModel('Llama-3.2-1B-Instruct-q4f16'),
 *   prompt: 'Explain AI',
 *   onChunk: (chunk) => {
 *     // Update UI in real-time
 *     appendToOutput(chunk.text);
 *   },
 * });
 * ```
 *
 * @throws {Error} If model doesn't support streaming or generation fails
 */
export async function streamText(options: StreamTextOptions): Promise<StreamTextResult> {
  const {
    model: modelOrId,
    prompt,
    systemPrompt,
    messages,
    maxTokens = 256,
    temperature = 0.7,
    topP = 1.0,
    stopSequences,
    abortSignal,
    providerOptions,
    onChunk,
  } = options;

  // Check for cancellation before starting
  abortSignal?.throwIfAborted();

  // Resolve the model
  const model = resolveModel(modelOrId);

  // Check if model supports streaming
  if (!model.doStream) {
    throw new Error(
      `Model ${model.modelId} does not support streaming. Use generateText() instead.`
    );
  }

  // Create the stream
  const streamOptions = {
    prompt,
    systemPrompt,
    messages,
    maxTokens,
    temperature,
    topP,
    stopSequences,
    abortSignal,
    providerOptions,
  };

  const innerStream = model.doStream(streamOptions);

  // Track accumulated text and usage
  let accumulatedText = '';
  let finalUsage: GenerationUsage | null = null;
  let resolveText: (text: string) => void;
  let rejectText: (error: Error) => void;
  let resolveUsage: (usage: GenerationUsage) => void;
  let rejectUsage: (error: Error) => void;

  const textPromise = new Promise<string>((resolve, reject) => {
    resolveText = resolve;
    rejectText = reject;
  });

  const usagePromise = new Promise<GenerationUsage>((resolve, reject) => {
    resolveUsage = resolve;
    rejectUsage = reject;
  });

  // Create wrapped stream that tracks state
  async function* wrappedStream(): AsyncIterable<StreamChunk> {
    try {
      const startTime = performance.now();

      for await (const chunk of innerStream) {
        // Check for cancellation
        abortSignal?.throwIfAborted();

        accumulatedText += chunk.text;

        // Call onChunk callback if provided
        if (onChunk) {
          onChunk(chunk);
        }

        if (chunk.done && chunk.usage) {
          finalUsage = {
            ...chunk.usage,
            durationMs: performance.now() - startTime,
          };
        }

        yield chunk;

        if (chunk.done) {
          break;
        }
      }

      // Resolve promises
      resolveText(accumulatedText);
      if (finalUsage) {
        resolveUsage(finalUsage);
      } else {
        // Create approximate usage if not provided by model
        resolveUsage({
          inputTokens: Math.ceil(prompt.length / 4), // Rough estimate
          outputTokens: Math.ceil(accumulatedText.length / 4),
          totalTokens: Math.ceil((prompt.length + accumulatedText.length) / 4),
          durationMs: performance.now() - startTime,
        });
      }
    } catch (error) {
      rejectText(error as Error);
      rejectUsage(error as Error);
      throw error;
    }
  }

  return {
    stream: wrappedStream(),
    text: textPromise,
    usage: usagePromise,
    response: {
      modelId: model.modelId,
      timestamp: new Date(),
    },
  };
}

