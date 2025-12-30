/**
 * Text Generation Function
 *
 * Function-first API for generating text with language models.
 *
 * @packageDocumentation
 */

import type {
  LanguageModel,
  GenerateTextOptions,
  GenerateTextResult,
  LanguageModelFactory,
} from './types.js';

// Global provider for string model ID resolution
let globalLanguageModelProvider: LanguageModelFactory | null = null;

/**
 * Set the global language model provider for string model ID resolution.
 *
 * @param provider - Factory function to create language models from string IDs
 *
 * @example
 * ```ts
 * import { setGlobalLanguageModelProvider } from '@localmode/core';
 * import { webllm } from '@localmode/webllm';
 *
 * setGlobalLanguageModelProvider((modelId) => webllm.languageModel(modelId));
 *
 * // Now you can use string model IDs
 * const { text } = await generateText({
 *   model: 'Llama-3.2-1B-Instruct-q4f16',
 *   prompt: 'Hello',
 * });
 * ```
 */
export function setGlobalLanguageModelProvider(provider: LanguageModelFactory | null): void {
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
 * Generate text using a language model.
 *
 * @param options - Generation options including model, prompt, and parameters
 * @returns Promise with generated text and usage information
 *
 * @example Basic usage
 * ```ts
 * import { generateText } from '@localmode/core';
 * import { webllm } from '@localmode/webllm';
 *
 * const { text, usage } = await generateText({
 *   model: webllm.languageModel('Llama-3.2-1B-Instruct-q4f16'),
 *   prompt: 'Explain quantum computing',
 *   maxTokens: 200,
 * });
 *
 * console.log(text);
 * console.log(`Generated ${usage.outputTokens} tokens in ${usage.durationMs}ms`);
 * ```
 *
 * @example With system prompt
 * ```ts
 * const { text } = await generateText({
 *   model: webllm.languageModel('Llama-3.2-1B-Instruct-q4f16'),
 *   systemPrompt: 'You are a helpful assistant.',
 *   prompt: 'What is the capital of France?',
 * });
 * ```
 *
 * @example With cancellation
 * ```ts
 * const controller = new AbortController();
 *
 * const promise = generateText({
 *   model: webllm.languageModel('Llama-3.2-1B-Instruct-q4f16'),
 *   prompt: 'Write a long story',
 *   maxTokens: 1000,
 *   abortSignal: controller.signal,
 * });
 *
 * // Cancel after 5 seconds
 * setTimeout(() => controller.abort(), 5000);
 * ```
 *
 * @throws {Error} If no model is provided or generation fails
 */
export async function generateText(options: GenerateTextOptions): Promise<GenerateTextResult> {
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

      const result = await model.doGenerate({
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

      const durationMs = performance.now() - startTime;

      return {
        text: result.text,
        finishReason: result.finishReason,
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

  // Should not reach here, but just in case
  throw lastError || new Error('Generation failed');
}

