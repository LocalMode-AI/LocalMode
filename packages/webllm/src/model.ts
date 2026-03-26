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
  ContentPart,
} from '@localmode/core';
import type { WebLLMModelSettings, WebLLMLoadProgress } from './types.js';

// Dynamic import type for WebLLM
type MLCEngine = import('@mlc-ai/web-llm').MLCEngine;

/** Model IDs that support vision input */
const VISION_MODEL_IDS = new Set([
  'Phi-3.5-vision-instruct-q4f16_1-MLC',
]);

/**
 * WebLLM Language Model implementation.
 *
 * Uses WebLLM for efficient LLM inference in the browser with 4-bit quantized models.
 */
export class WebLLMLanguageModel implements LanguageModel {
  readonly modelId: string;
  readonly provider = 'webllm';
  readonly contextLength: number;
  readonly supportsVision: boolean;

  private engine: MLCEngine | null = null;
  private loadPromise: Promise<MLCEngine> | null = null;

  constructor(
    private baseModelId: string,
    private settings: WebLLMModelSettings = {}
  ) {
    this.modelId = `webllm:${baseModelId}`;
    this.contextLength = settings.contextLength ?? 4096;
    this.supportsVision = VISION_MODEL_IDS.has(baseModelId);
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
   * Build messages array from generation options.
   *
   * Handles both string content and ContentPart[] multimodal content.
   * For vision models, converts ImagePart to OpenAI-compatible image_url format.
   * @internal
   */
  private async buildMessages(options: {
    prompt: string;
    systemPrompt?: string;
    messages?: Array<{ role: string; content: string | ContentPart[] }>;
  }): Promise<Array<{ role: string; content: unknown }>> {
    const msgs: Array<{ role: string; content: unknown }> = [];

    const systemPrompt = options.systemPrompt ?? this.settings.systemPrompt;
    if (systemPrompt) {
      msgs.push({ role: 'system', content: systemPrompt });
    }

    if (options.messages && options.messages.length > 0) {
      for (const msg of options.messages) {
        msgs.push({ role: msg.role, content: await this.convertContentAsync(msg.content) });
      }
    }

    if (options.prompt) {
      msgs.push({ role: 'user', content: options.prompt });
    }

    return msgs;
  }

  /**
   * Convert content to WebLLM format, preprocessing images for vision models.
   * @internal
   */
  private async convertContentAsync(content: string | ContentPart[]): Promise<unknown> {
    if (typeof content === 'string') {
      return content;
    }

    const parts = [];
    for (const part of content) {
      if (part.type === 'text') {
        parts.push({ type: 'text', text: part.text });
      } else {
        const dataUrl = `data:${part.mimeType};base64,${part.data}`;
        const processedUrl = await this.preprocessImage(dataUrl);
        parts.push({
          type: 'image_url',
          image_url: { url: processedUrl },
        });
      }
    }
    return parts;
  }

  /**
   * Preprocess an image for the vision model by resizing it to fit within
   * the Phi-3-V tile grid (336px tiles, max 4×4 = 1344px per side).
   *
   * This prevents the `embed.shape[0]` mismatch error that occurs when
   * images are too large for the model's fixed IMAGE_EMBED_SIZE.
   *
   * @param dataUrl - The original image as a data URI
   * @returns Resized image as a data URI, or original if already within bounds
   * @internal
   */
  private async preprocessImage(dataUrl: string): Promise<string> {
    // Only preprocess for vision models
    if (!this.supportsVision) return dataUrl;

    // Max dimension: 4 tiles × 336px = 1344px per side
    const MAX_DIM = 1344;

    return new Promise<string>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const { width, height } = img;

        // If already within bounds, use original
        if (width <= MAX_DIM && height <= MAX_DIM) {
          resolve(dataUrl);
          return;
        }

        // Scale down preserving aspect ratio
        const scale = Math.min(MAX_DIM / width, MAX_DIM / height);
        const newW = Math.round(width * scale);
        const newH = Math.round(height * scale);

        const canvas = new OffscreenCanvas(newW, newH);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, newW, newH);

        canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 }).then((blob) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      };
      img.onerror = () => resolve(dataUrl); // Fallback to original on error
      img.src = dataUrl;
    });
  }

  /**
   * Generate text from a prompt.
   */
  async doGenerate(options: DoGenerateOptions): Promise<DoGenerateResult> {
    const {
      prompt,
      systemPrompt,
      messages,
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

    const engineMessages = await this.buildMessages({ prompt, systemPrompt, messages });

    // Generate completion
    const response = await engine.chat.completions.create({
      messages: engineMessages as Parameters<typeof engine.chat.completions.create>[0]['messages'],
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
      messages,
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

    const engineMessages = await this.buildMessages({ prompt, systemPrompt, messages });

    // Stream completion
    const stream = await engine.chat.completions.create({
      messages: engineMessages as Parameters<typeof engine.chat.completions.create>[0]['messages'],
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
