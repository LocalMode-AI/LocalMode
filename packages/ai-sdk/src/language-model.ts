/**
 * @file language-model.ts
 * @description Adapter wrapping a LocalMode LanguageModel as an AI SDK LanguageModelV3
 */

import type { LanguageModel } from '@localmode/core';
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamResult,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from '@ai-sdk/provider';
import { mapFinishReason, convertPrompt } from './utils.js';

/**
 * Wraps a `@localmode/core` LanguageModel as an AI SDK LanguageModelV3.
 *
 * Use this to make local language models (e.g. via `@localmode/webllm`)
 * work with AI SDK functions like `generateText()` and `streamText()`.
 *
 * @example
 * ```ts
 * import { webllm } from '@localmode/webllm';
 * import { generateText } from 'ai';
 *
 * const model = new LocalModeLanguageModel(
 *   webllm.languageModel('Llama-3.2-1B-Instruct-q4f16_1-MLC')
 * );
 * const { text } = await generateText({ model, prompt: 'Hello' });
 * ```
 */
export class LocalModeLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3' as const;
  readonly provider = 'localmode';
  readonly modelId: string;
  readonly supportedUrls: Record<string, RegExp[]> = {};

  /** @internal The wrapped LocalMode language model */
  private readonly model: LanguageModel;

  /**
   * @param model - A LocalMode LanguageModel instance to wrap
   */
  constructor(model: LanguageModel) {
    this.model = model;
    this.modelId = model.modelId;
  }

  /**
   * Generate text (non-streaming).
   *
   * @param options - AI SDK call options
   * @returns AI SDK generation result
   */
  async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
    const { systemPrompt, messages, prompt } = convertPrompt(options.prompt);

    const result = await this.model.doGenerate({
      prompt,
      systemPrompt,
      messages: messages.length > 0 ? messages : undefined,
      maxTokens: options.maxOutputTokens,
      temperature: options.temperature,
      topP: options.topP,
      stopSequences: options.stopSequences,
      abortSignal: options.abortSignal,
    });

    const usage: LanguageModelV3Usage = {
      inputTokens: {
        total: result.usage.inputTokens,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: result.usage.outputTokens,
        text: result.usage.outputTokens,
        reasoning: undefined,
      },
    };

    return {
      content: [{ type: 'text' as const, text: result.text }],
      finishReason: mapFinishReason(result.finishReason),
      usage,
      warnings: [],
    };
  }

  /**
   * Generate text (streaming).
   *
   * Falls back to doGenerate if the wrapped model does not support streaming.
   *
   * @param options - AI SDK call options
   * @returns AI SDK stream result
   */
  async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
    const { systemPrompt, messages, prompt } = convertPrompt(options.prompt);
    const textId = 'text-0';

    if (this.model.doStream) {
      const iterable = this.model.doStream({
        prompt,
        systemPrompt,
        messages: messages.length > 0 ? messages : undefined,
        maxTokens: options.maxOutputTokens,
        temperature: options.temperature,
        topP: options.topP,
        stopSequences: options.stopSequences,
        abortSignal: options.abortSignal,
      });

      const stream = new ReadableStream<LanguageModelV3StreamPart>({
        async start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });
          controller.enqueue({ type: 'text-start', id: textId });

          try {
            let lastUsage: LanguageModelV3Usage | undefined;
            let lastFinishReason: ReturnType<typeof mapFinishReason> | undefined;

            for await (const chunk of iterable) {
              if (options.abortSignal?.aborted) {
                controller.close();
                return;
              }

              if (chunk.text) {
                controller.enqueue({
                  type: 'text-delta',
                  id: textId,
                  delta: chunk.text,
                });
              }

              if (chunk.usage) {
                lastUsage = {
                  inputTokens: {
                    total: chunk.usage.inputTokens,
                    noCache: undefined,
                    cacheRead: undefined,
                    cacheWrite: undefined,
                  },
                  outputTokens: {
                    total: chunk.usage.outputTokens,
                    text: chunk.usage.outputTokens,
                    reasoning: undefined,
                  },
                };
              }

              if (chunk.finishReason) {
                lastFinishReason = mapFinishReason(chunk.finishReason);
              }
            }

            controller.enqueue({ type: 'text-end', id: textId });

            controller.enqueue({
              type: 'finish',
              usage: lastUsage ?? {
                inputTokens: { total: 0, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
                outputTokens: { total: 0, text: undefined, reasoning: undefined },
              },
              finishReason: lastFinishReason ?? { unified: 'stop', raw: 'stop' },
            });

            controller.close();
          } catch (error) {
            controller.enqueue({ type: 'error', error });
            controller.close();
          }
        },
      });

      return { stream };
    }

    // Fallback: doGenerate and emit as single text chunk
    const result = await this.model.doGenerate({
      prompt,
      systemPrompt,
      messages: messages.length > 0 ? messages : undefined,
      maxTokens: options.maxOutputTokens,
      temperature: options.temperature,
      topP: options.topP,
      stopSequences: options.stopSequences,
      abortSignal: options.abortSignal,
    });

    const usage: LanguageModelV3Usage = {
      inputTokens: {
        total: result.usage.inputTokens,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: result.usage.outputTokens,
        text: result.usage.outputTokens,
        reasoning: undefined,
      },
    };

    const stream = new ReadableStream<LanguageModelV3StreamPart>({
      start(controller) {
        controller.enqueue({ type: 'stream-start', warnings: [] });
        controller.enqueue({ type: 'text-start', id: textId });
        controller.enqueue({ type: 'text-delta', id: textId, delta: result.text });
        controller.enqueue({ type: 'text-end', id: textId });
        controller.enqueue({
          type: 'finish',
          usage,
          finishReason: mapFinishReason(result.finishReason),
        });
        controller.close();
      },
    });

    return { stream };
  }
}
