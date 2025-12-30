/**
 * WebLLM Language Model Implementation
 *
 * Implements LanguageModel interface using WebLLM (@mlc-ai/web-llm)
 *
 * @packageDocumentation
 */

import type {
  LanguageModel,
  DoGenerateOptions,
  DoGenerateResult,
  DoStreamOptions,
  StreamChunk,
  FinishReason,
} from '@localmode/core';
import type { WebLLMModelSettings, WebLLMLoadProgress } from './types.js';

// Dynamic import type for WebLLM
type MLCEngine = import('@mlc-ai/web-llm').MLCEngine;

/**
 * WebLLM Language Model implementation.
 *
 * Uses WebLLM for efficient LLM inference in the browser with 4-bit quantized models.
 */
export class WebLLMLanguageModel implements LanguageModel {
  readonly modelId: string;
  readonly provider = 'webllm';
  readonly contextLength: number;

  private engine: MLCEngine | null = null;
  private loadPromise: Promise<MLCEngine> | null = null;

  constructor(
    private baseModelId: string,
    private settings: WebLLMModelSettings = {}
  ) {
    this.modelId = `webllm:${baseModelId}`;
    // Default context length for common models
    this.contextLength = settings.contextLength ?? 4096;
  }

  /**
   * Load the WebLLM engine.
   */
  private async loadEngine(): Promise<MLCEngine> {
    if (this.engine) {
      return this.engine;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      const { CreateMLCEngine } = await import('@mlc-ai/web-llm');

      const engine = await CreateMLCEngine(this.baseModelId, {
        initProgressCallback: (report) => {
          if (this.settings.onProgress) {
            const progress: WebLLMLoadProgress = {
              status: report.progress === 1 ? 'done' : 'progress',
              progress: report.progress * 100,
              text: report.text,
            };
            this.settings.onProgress(progress);
          }
        },
      });

      this.engine = engine;
      return engine;
    })();

    return this.loadPromise;
  }

  /**
   * Generate text from a prompt.
   */
  async doGenerate(options: DoGenerateOptions): Promise<DoGenerateResult> {
    const {
      prompt,
      systemPrompt,
      maxTokens = this.settings.maxTokens ?? 512,
      temperature = this.settings.temperature ?? 0.7,
      topP = this.settings.topP ?? 0.95,
      stopSequences,
      abortSignal,
    } = options;

    abortSignal?.throwIfAborted();

    const engine = await this.loadEngine();

    abortSignal?.throwIfAborted();

    const startTime = Date.now();

    // Prepare messages
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];

    if (systemPrompt ?? this.settings.systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt ?? this.settings.systemPrompt ?? '' });
    }

    messages.push({ role: 'user', content: prompt });

    // Generate completion
    const response = await engine.chat.completions.create({
      messages,
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
      stop: stopSequences,
    });

    const text = response.choices[0]?.message?.content ?? '';
    const finishReason = this.mapFinishReason(response.choices[0]?.finish_reason);

    return {
      text,
      finishReason,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
        durationMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Map WebLLM finish reason to core FinishReason type.
   */
  private mapFinishReason(reason: string | null | undefined): FinishReason {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }

  /**
   * Stream text generation token by token.
   */
  async *doStream(options: DoStreamOptions): AsyncIterable<StreamChunk> {
    const {
      prompt,
      systemPrompt,
      maxTokens = this.settings.maxTokens ?? 512,
      temperature = this.settings.temperature ?? 0.7,
      topP = this.settings.topP ?? 0.95,
      stopSequences,
      abortSignal,
    } = options;

    abortSignal?.throwIfAborted();

    const engine = await this.loadEngine();

    abortSignal?.throwIfAborted();

    const startTime = Date.now();

    // Prepare messages
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];

    if (systemPrompt ?? this.settings.systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt ?? this.settings.systemPrompt ?? '' });
    }

    messages.push({ role: 'user', content: prompt });

    // Stream completion
    const stream = await engine.chat.completions.create({
      messages,
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
      stop: stopSequences,
      stream: true,
    });

    let totalOutputTokens = 0;

    for await (const chunk of stream) {
      abortSignal?.throwIfAborted();

      const text = chunk.choices[0]?.delta?.content ?? '';
      totalOutputTokens++;

      const finishReasonRaw = chunk.choices[0]?.finish_reason;
      const done = finishReasonRaw !== null && finishReasonRaw !== undefined;
      const finishReason = done ? this.mapFinishReason(finishReasonRaw) : undefined;

      yield {
        text,
        done,
        finishReason,
        usage: done
          ? {
              inputTokens: 0, // Not available in streaming
              outputTokens: totalOutputTokens,
              totalTokens: totalOutputTokens,
              durationMs: Date.now() - startTime,
            }
          : undefined,
      };
    }
  }

  /**
   * Unload the model and free resources.
   */
  async unload(): Promise<void> {
    if (this.engine) {
      await this.engine.unload();
      this.engine = null;
      this.loadPromise = null;
    }
  }
}

/**
 * Create a WebLLM language model.
 */
export function createLanguageModel(
  modelId: string,
  settings?: WebLLMModelSettings
): WebLLMLanguageModel {
  return new WebLLMLanguageModel(modelId, settings);
}
