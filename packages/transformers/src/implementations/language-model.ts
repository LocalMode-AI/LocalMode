/**
 * Transformers Language Model Implementation (TJS v4)
 *
 * Implements LanguageModel interface using Transformers.js v4 (via npm alias
 * `@huggingface/transformers-v4`). Supports two loading strategies:
 *
 * 1. **Standard pipeline** — For text-only models (SmolLM2, Phi, Qwen3, etc.)
 *    Uses `pipeline('text-generation', modelId, { device })`.
 *
 * 2. **Qwen3.5 multimodal** — For Qwen3.5 ONNX models which have a split
 *    architecture (embed_tokens + vision_encoder + decoder_model_merged).
 *    Uses `AutoModelForCausalLM.from_pretrained` with per-component dtype config
 *    and `AutoTokenizer` for tokenization.
 *
 * The loading strategy is auto-detected from the model ID.
 *
 * **Experimental**: This implementation uses Transformers.js v4 which is
 * currently a preview release (`@next` tag). The API may change in future
 * releases.
 *
 * NOTE: This is the ONLY file that imports from `@huggingface/transformers-v4`.
 * All 24 existing implementations continue to use `@huggingface/transformers` (v3).
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
import { ModelLoadError, GenerationError } from '@localmode/core';
import type { LanguageModelSettings } from '../types.js';

/**
 * Type for the TJS v4 text-generation pipeline instance.
 * Obtained via dynamic import to avoid bundling if unused.
 */
type TextGenerationPipeline = Awaited<
  ReturnType<typeof import('@huggingface/transformers-v4').pipeline>
>;

/**
 * Detect if a model ID refers to a Qwen3.5 multimodal ONNX model.
 * These require special loading via AutoModelForCausalLM instead of pipeline().
 */
function isQwen35Model(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return lower.includes('qwen3.5') || lower.includes('qwen3_5') || lower.includes('qwen35');
}

/**
 * Internal wrapper that holds either a pipeline or a Qwen3.5 model+tokenizer pair.
 * This abstraction lets doGenerate/doStream work the same way regardless of loading strategy.
 */
interface LoadedModel {
  type: 'pipeline' | 'qwen35';
  /** For pipeline models */
  pipeline?: TextGenerationPipeline;
  /** For Qwen3.5 models */
  model?: unknown;
  tokenizer?: unknown;
  /** For Qwen3.5 vision — processes images into model-compatible tensors */
  processor?: unknown;
}

/**
 * Transformers.js v4 Language Model implementation.
 *
 * Uses TJS v4 for ONNX model inference in the browser with WebGPU
 * acceleration and automatic WASM fallback.
 *
 * @example
 * ```ts
 * import { TransformersLanguageModel } from '@localmode/transformers';
 * import { generateText } from '@localmode/core';
 *
 * const model = new TransformersLanguageModel('onnx-community/Qwen3.5-0.8B-ONNX');
 *
 * const { text } = await generateText({
 *   model,
 *   prompt: 'What is 2+2?',
 * });
 * ```
 */
export class TransformersLanguageModel implements LanguageModel {
  readonly modelId: string;
  readonly provider = 'transformers';
  readonly contextLength: number;
  readonly supportsVision: boolean;

  private loaded: LoadedModel | null = null;
  private loadPromise: Promise<LoadedModel> | null = null;
  private baseModelId: string;
  private settings: LanguageModelSettings;

  constructor(baseModelId: string, settings: LanguageModelSettings = {}) {
    this.baseModelId = baseModelId;
    this.settings = settings;
    this.modelId = `transformers:${baseModelId}`;
    this.contextLength = settings.contextLength ?? 4096;
    this.supportsVision = isQwen35Model(baseModelId);
  }

  /**
   * Determine the device to use for inference.
   * @internal
   */
  private getDevice(): string {
    if (this.settings.device) return this.settings.device;
    const hasWebGPU =
      typeof navigator !== 'undefined' &&
      'gpu' in navigator &&
      navigator.gpu !== undefined;
    return hasWebGPU ? 'webgpu' : 'wasm';
  }

  /**
   * Lazily load the model. Auto-detects whether to use pipeline or Qwen3.5 loading.
   * Deduplicates concurrent calls -- only one load occurs.
   * @internal
   */
  private async load(): Promise<LoadedModel> {
    if (this.loaded) return this.loaded;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      try {
        const device = this.getDevice();

        if (isQwen35Model(this.baseModelId)) {
          return await this.loadQwen35(device);
        } else {
          return await this.loadPipeline(device);
        }
      } catch (error) {
        this.loadPromise = null;

        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        if (error instanceof ModelLoadError) throw error;

        const cause = error instanceof Error ? error : undefined;
        throw new ModelLoadError(this.baseModelId, cause);
      }
    })();

    return this.loadPromise;
  }

  /**
   * Load a standard text-generation pipeline (SmolLM2, Phi, Qwen3, etc.)
   * @internal
   */
  private async loadPipeline(device: string): Promise<LoadedModel> {
    const { pipeline, env } = await import('@huggingface/transformers-v4');

    // Suppress ONNX runtime warnings about node execution providers
    env.backends.onnx.logLevel = 'error';

    const pipe = await pipeline('text-generation', this.baseModelId, {
      device,
      dtype: 'q4',
      progress_callback: this.settings.onProgress,
    } as Record<string, unknown>);

    const result: LoadedModel = { type: 'pipeline', pipeline: pipe };
    this.loaded = result;
    return result;
  }

  /**
   * Load a Qwen3.5 multimodal model using AutoModelForCausalLM + AutoTokenizer.
   *
   * Qwen3.5 ONNX repos have a split architecture:
   * - embed_tokens (token embeddings)
   * - vision_encoder (image processing)
   * - decoder_model_merged (the actual LLM)
   *
   * Each component can be loaded with a different dtype (q4, fp16, etc.)
   * For text-only use, we still load all 3 but use q4 for smallest size.
   * @internal
   */
  private async loadQwen35(device: string): Promise<LoadedModel> {
    const tjs = await import('@huggingface/transformers-v4');

    // Suppress ONNX runtime warnings about node execution providers
    tjs.env.backends.onnx.logLevel = 'error';

    // Use the most efficient dtype for browser: q4 for text, fp16 for vision encoder
    const dtype = this.settings.dtype ?? {
      embed_tokens: 'q4',
      vision_encoder: 'fp16',
      decoder_model_merged: 'q4',
    };

    const [tokenizer, processor, model] = await Promise.all([
      tjs.AutoTokenizer.from_pretrained(this.baseModelId, {
        progress_callback: this.settings.onProgress,
      } as Record<string, unknown>),
      tjs.AutoProcessor.from_pretrained(this.baseModelId, {
        progress_callback: this.settings.onProgress,
      } as Record<string, unknown>),
      (tjs as Record<string, unknown>).Qwen3_5ForConditionalGeneration
        ? (tjs as { Qwen3_5ForConditionalGeneration: { from_pretrained: Function } }).Qwen3_5ForConditionalGeneration.from_pretrained(this.baseModelId, {
            dtype,
            device,
            progress_callback: this.settings.onProgress,
          } as Record<string, unknown>)
        : tjs.AutoModelForCausalLM.from_pretrained(this.baseModelId, {
            dtype,
            device,
            progress_callback: this.settings.onProgress,
          } as Record<string, unknown>),
    ]);

    const result: LoadedModel = { type: 'qwen35', model, tokenizer, processor };
    this.loaded = result;
    return result;
  }

  /**
   * Build messages array from generation options.
   *
   * For multimodal content, converts to TJS v4 chat template format:
   * - TextPart → { type: 'text', text }
   * - ImagePart → { type: 'image', image: RawImage }
   *
   * Returns both the formatted messages and any extracted RawImage instances
   * for processor-based generation.
   * @internal
   */
  private buildMessages(options: {
    prompt: string;
    systemPrompt?: string;
    messages?: Array<{ role: string; content: string | ContentPart[] }>;
  }): { messages: Array<{ role: string; content: unknown }>; images: unknown[] } {
    const messages: Array<{ role: string; content: unknown }> = [];
    const images: unknown[] = [];

    const systemPrompt = options.systemPrompt ?? this.settings.systemPrompt;
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    if (options.messages && options.messages.length > 0) {
      for (const msg of options.messages) {
        if (typeof msg.content === 'string') {
          messages.push({ role: msg.role, content: msg.content });
        } else {
          // Multimodal content — convert parts for chat template
          // Use { type: 'image' } placeholder; actual RawImage passed separately to processor
          const parts: Array<{ type: string; text?: string }> = [];
          for (const part of msg.content) {
            if (part.type === 'text') {
              parts.push({ type: 'text', text: part.text });
            } else if (part.type === 'image') {
              parts.push({ type: 'image' });
              images.push(`data:${part.mimeType};base64,${part.data}`);
            }
          }
          messages.push({ role: msg.role, content: parts });
        }
      }
    }

    if (options.prompt) {
      messages.push({ role: 'user', content: options.prompt });
    }

    return { messages, images };
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
      abortSignal,
    } = options;

    abortSignal?.throwIfAborted();

    const loaded = await this.load();

    abortSignal?.throwIfAborted();

    const startTime = Date.now();
    const { messages: chatMessages, images } = this.buildMessages({ prompt, systemPrompt, messages });

    try {
      if (loaded.type === 'qwen35') {
        return await this.generateQwen35(loaded, chatMessages, {
          maxTokens, temperature, topP, startTime, images,
        });
      } else {
        return await this.generatePipeline(loaded, chatMessages, {
          maxTokens, temperature, topP, startTime,
        });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      if (error instanceof Error && error.name === 'AbortError') throw error;
      if (error instanceof GenerationError) throw error;

      const cause = error instanceof Error ? error : undefined;
      throw new GenerationError(
        `Text generation failed with model ${this.modelId}: ${cause?.message ?? String(error)}`,
        {
          hint: 'Check that the ONNX model loaded correctly and the prompt is valid.',
          cause,
        }
      );
    }
  }

  /**
   * Generate using the standard text-generation pipeline.
   * @internal
   */
  private async generatePipeline(
    loaded: LoadedModel,
    chatMessages: Array<{ role: string; content: unknown }>,
    opts: { maxTokens: number; temperature: number; topP: number; startTime: number }
  ): Promise<DoGenerateResult> {
    const result = await (loaded.pipeline as CallableFunction)(chatMessages, {
      max_new_tokens: opts.maxTokens,
      temperature: opts.temperature > 0 ? opts.temperature : undefined,
      top_p: opts.topP,
      do_sample: opts.temperature > 0,
      return_full_text: false,
    });

    const text = this.extractTextFromPipelineResult(result);
    const inputText = chatMessages.map((m) => typeof m.content === 'string' ? m.content : '').join(' ');
    const inputTokens = Math.ceil(inputText.length / 4);
    const outputTokens = Math.ceil(text.length / 4);
    const finishReason: FinishReason = outputTokens >= opts.maxTokens ? 'length' : 'stop';

    return {
      text,
      finishReason,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        durationMs: Date.now() - opts.startTime,
      },
    };
  }

  /**
   * Generate using Qwen3.5 AutoModelForCausalLM + AutoTokenizer.
   * @internal
   */
  private async generateQwen35(
    loaded: LoadedModel,
    chatMessages: Array<{ role: string; content: unknown }>,
    opts: { maxTokens: number; temperature: number; topP: number; startTime: number; images: unknown[] }
  ): Promise<DoGenerateResult> {
    const tjs = await import('@huggingface/transformers-v4');
    const tokenizer = loaded.tokenizer as {
      apply_chat_template: (messages: unknown[], options: Record<string, unknown>) => unknown;
      decode: (ids: unknown, options?: Record<string, unknown>) => string;
      batch_decode: (ids: unknown, options?: Record<string, unknown>) => string[];
    };
    const processor = loaded.processor as {
      apply_chat_template: (messages: unknown[], options: Record<string, unknown>) => string;
      (text: string, ...args: unknown[]): Promise<Record<string, unknown>>;
    } | null;
    const model = loaded.model as {
      generate: (options: Record<string, unknown>) => Promise<unknown>;
    };

    let inputs: Record<string, unknown>;

    // If images are present and processor is available, use the TJS vision pattern:
    // 1. processor.apply_chat_template() to get prompt text
    // 2. Load images as RawImage
    // 3. processor(text, image) to create combined inputs
    if (opts.images.length > 0 && processor) {
      const rawImages = await Promise.all(
        opts.images.map(async (imgUrl) => {
          const img = await tjs.RawImage.read(imgUrl as string);
          return img.resize(448, 448);
        })
      );

      const text = processor.apply_chat_template(chatMessages, {
        add_generation_prompt: true,
      });
      const image = rawImages.length === 1 ? rawImages[0] : rawImages;
      inputs = await processor(text, image, null, { add_special_tokens: false }) as Record<string, unknown>;
    } else {
      // Text-only: use tokenizer's apply_chat_template
      inputs = tokenizer.apply_chat_template(chatMessages, {
        add_generation_prompt: true,
        return_dict: true,
      }) as Record<string, unknown>;
    }

    // Generate
    const output = await model.generate({
      ...inputs,
      max_new_tokens: opts.maxTokens,
      temperature: opts.temperature > 0 ? opts.temperature : undefined,
      top_p: opts.topP,
      do_sample: opts.temperature > 0,
    });

    // Decode — output is a tensor of token IDs, slice off the input tokens
    const outputArray = output as { tolist: () => number[][] };
    const allTokenIds = outputArray.tolist ? outputArray.tolist() : output;
    const decoded = tokenizer.batch_decode(allTokenIds, { skip_special_tokens: true });
    let text = Array.isArray(decoded) ? decoded[0] : String(decoded);

    // Strip the input prompt from the output if present
    const inputText = chatMessages.map((m) =>
      typeof m.content === 'string' ? m.content : ''
    ).join(' ');
    if (text.startsWith(inputText)) {
      text = text.slice(inputText.length).trim();
    }

    const inputTokens = Math.ceil(inputText.length / 4);
    const outputTokens = Math.ceil(text.length / 4);
    const finishReason: FinishReason = outputTokens >= opts.maxTokens ? 'length' : 'stop';

    return {
      text,
      finishReason,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        durationMs: Date.now() - opts.startTime,
      },
    };
  }

  /**
   * Extract text from pipeline result format.
   * @internal
   */
  private extractTextFromPipelineResult(result: unknown): string {
    const output = Array.isArray(result) ? result[0] : result;

    if (output && typeof output === 'object' && 'generated_text' in output) {
      const generatedText = (output as Record<string, unknown>).generated_text;
      if (typeof generatedText === 'string') return generatedText;
      if (Array.isArray(generatedText)) {
        const lastMsg = generatedText[generatedText.length - 1];
        return lastMsg && typeof lastMsg === 'object' && 'content' in lastMsg
          ? String((lastMsg as Record<string, unknown>).content)
          : String(generatedText);
      }
      return String(generatedText);
    }
    return String(output);
  }

  /**
   * Stream text generation token by token.
   *
   * For pipeline models: uses TJS v4's streamer callback.
   * For Qwen3.5 models: uses model.generate with TextStreamer.
   */
  async *doStream(options: DoStreamOptions): AsyncIterable<StreamChunk> {
    const {
      prompt,
      systemPrompt,
      messages,
      maxTokens = this.settings.maxTokens ?? 512,
      temperature = this.settings.temperature ?? 0.7,
      topP = this.settings.topP ?? 0.95,
      abortSignal,
    } = options;

    abortSignal?.throwIfAborted();

    const loaded = await this.load();

    abortSignal?.throwIfAborted();

    const startTime = Date.now();
    const { messages: chatMessages, images } = this.buildMessages({ prompt, systemPrompt, messages });

    // Promise-based queue for streaming tokens
    type QueueItem = { token: string; done: boolean };
    const queue: QueueItem[] = [];
    let resolveWaiting: ((item: QueueItem) => void) | null = null;
    let outputTokens = 0;
    const state: { error: Error | null } = { error: null };

    const pushToken = (item: QueueItem) => {
      if (resolveWaiting) {
        const resolve = resolveWaiting;
        resolveWaiting = null;
        resolve(item);
      } else {
        queue.push(item);
      }
    };

    const pullToken = (): Promise<QueueItem> => {
      if (queue.length > 0) return Promise.resolve(queue.shift()!);
      return new Promise<QueueItem>((resolve) => { resolveWaiting = resolve; });
    };

    const streamer = (token: string) => {
      outputTokens++;
      pushToken({ token, done: false });
    };

    // Start generation in background
    const completionPromise = (async () => {
      try {
        if (loaded.type === 'qwen35') {
          await this.streamQwen35(loaded, chatMessages, {
            maxTokens, temperature, topP, streamer, images,
          });
        } else {
          // TJS v4 pipeline requires a TextStreamer instance for streaming
          const tjs = await import('@huggingface/transformers-v4');
          const pipelineTokenizer = (loaded.pipeline as unknown as Record<string, unknown>).tokenizer;
          const textStreamer = new tjs.TextStreamer(
            pipelineTokenizer as InstanceType<typeof tjs.PreTrainedTokenizer>,
            { skip_prompt: true, skip_special_tokens: true, callback_function: streamer }
          );
          await (loaded.pipeline as CallableFunction)(chatMessages, {
            max_new_tokens: maxTokens,
            temperature: temperature > 0 ? temperature : undefined,
            top_p: topP,
            do_sample: temperature > 0,
            return_full_text: false,
            streamer: textStreamer,
          });
        }
        pushToken({ token: '', done: true });
      } catch (error) {
        state.error = error instanceof Error ? error : new Error(String(error));
        pushToken({ token: '', done: true });
      }
    })();

    const inputText = chatMessages.map((m) => typeof m.content === 'string' ? m.content : '').join(' ');
    const inputTokens = Math.ceil(inputText.length / 4);

    try {
      while (true) {
        abortSignal?.throwIfAborted();
        const item = await pullToken();

        if (item.done) {
          if (state.error) {
            if (state.error.name === 'AbortError') throw state.error;
            throw new GenerationError(
              `Streaming generation failed with model ${this.modelId}: ${state.error.message}`,
              { hint: 'Check that the ONNX model loaded correctly.', cause: state.error }
            );
          }

          const finishReason: FinishReason = outputTokens >= maxTokens ? 'length' : 'stop';
          yield {
            text: '',
            done: true,
            finishReason,
            usage: {
              inputTokens,
              outputTokens,
              totalTokens: inputTokens + outputTokens,
              durationMs: Date.now() - startTime,
            },
          };
          break;
        }

        if (item.token.length > 0) {
          yield { text: item.token, done: false };
        }
      }
    } finally {
      await completionPromise.catch(() => {});
    }
  }

  /**
   * Stream Qwen3.5 generation using model.generate with a callback streamer.
   * @internal
   */
  private async streamQwen35(
    loaded: LoadedModel,
    chatMessages: Array<{ role: string; content: unknown }>,
    opts: { maxTokens: number; temperature: number; topP: number; streamer: (token: string) => void; images: unknown[] }
  ): Promise<void> {
    const tjs = await import('@huggingface/transformers-v4');

    const tokenizer = loaded.tokenizer as {
      apply_chat_template: (messages: unknown[], options: Record<string, unknown>) => unknown;
    };
    const processor = loaded.processor as {
      apply_chat_template: (messages: unknown[], options: Record<string, unknown>) => string;
      (text: string, ...args: unknown[]): Promise<Record<string, unknown>>;
    } | null;
    const model = loaded.model as {
      generate: (options: Record<string, unknown>) => Promise<unknown>;
    };

    let inputs: Record<string, unknown>;

    // If images are present and processor is available, use the TJS vision pattern
    if (opts.images.length > 0 && processor) {
      const rawImages = await Promise.all(
        opts.images.map(async (imgUrl) => {
          const img = await tjs.RawImage.read(imgUrl as string);
          return img.resize(448, 448);
        })
      );
      const text = processor.apply_chat_template(chatMessages, {
        add_generation_prompt: true,
      });
      const image = rawImages.length === 1 ? rawImages[0] : rawImages;
      inputs = await processor(text, image, null, { add_special_tokens: false }) as Record<string, unknown>;
    } else {
      inputs = tokenizer.apply_chat_template(chatMessages, {
        add_generation_prompt: true,
        return_dict: true,
      }) as Record<string, unknown>;
    }

    // TJS v4 TextStreamer decodes tokens incrementally and calls the callback
    const textStreamer = new tjs.TextStreamer(tokenizer as never, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: opts.streamer,
    });

    await model.generate({
      ...inputs,
      max_new_tokens: opts.maxTokens,
      temperature: opts.temperature > 0 ? opts.temperature : undefined,
      top_p: opts.topP,
      do_sample: opts.temperature > 0,
      streamer: textStreamer,
    });
  }

  /**
   * Unload the model and free GPU/WASM resources.
   */
  async unload(): Promise<void> {
    if (this.loaded) {
      try {
        if (this.loaded.type === 'pipeline' && this.loaded.pipeline) {
          const pipe = this.loaded.pipeline as unknown as { dispose?: () => Promise<void> | void };
          if (typeof pipe.dispose === 'function') await pipe.dispose();
        } else if (this.loaded.type === 'qwen35' && this.loaded.model) {
          const m = this.loaded.model as { dispose?: () => Promise<void> | void };
          if (typeof m.dispose === 'function') await m.dispose();
        }
      } catch {
        // Ignore errors during cleanup
      }
      this.loaded = null;
      this.loadPromise = null;
    }
  }
}

/**
 * Create a Transformers.js v4 language model for ONNX inference.
 *
 * Auto-detects whether to use the standard text-generation pipeline
 * or Qwen3.5-specific loading based on the model ID.
 *
 * @param modelId - HuggingFace model ID (e.g., 'onnx-community/Qwen3.5-0.8B-ONNX')
 * @param settings - Model settings
 * @returns A TransformersLanguageModel instance
 *
 * @example
 * ```ts
 * import { createLanguageModel } from '@localmode/transformers';
 * import { generateText } from '@localmode/core';
 *
 * const model = createLanguageModel('onnx-community/Qwen3.5-0.8B-ONNX');
 * const { text } = await generateText({ model, prompt: 'Hello!' });
 * ```
 */
export function createLanguageModel(
  modelId: string,
  settings?: LanguageModelSettings
): TransformersLanguageModel {
  return new TransformersLanguageModel(modelId, settings);
}
