/**
 * Transformers Language Model Implementation
 *
 * Implements LanguageModel interface using Transformers.js v4.
 * Supports two loading strategies:
 *
 * 1. **Standard pipeline** — For text-only models (SmolLM2, Phi, Qwen3, etc.)
 *    Uses `pipeline('text-generation', modelId, { device })`.
 *
 * 2. **VLM (vision-language)** — For Qwen3.5, Qwen3-VL, and Qwen2.5-VL ONNX
 *    models which have a split architecture (embed_tokens + vision_encoder +
 *    decoder_model_merged). Uses `AutoModelForCausalLM.from_pretrained` with
 *    per-component dtype config and `AutoTokenizer` for tokenization.
 *
 * The loading strategy is auto-detected from the model ID.
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
  ReturnType<typeof import('@huggingface/transformers').pipeline>
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
 * Detect if a model ID refers to a Qwen VL (vision-language) ONNX model.
 * Covers Qwen2.5-VL and Qwen3-VL families. These share the same TJS v4
 * architecture chain as Qwen3.5 and use the same loading path.
 */
function isQwenVLModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return /qwen[23][\._]?5?-vl/i.test(lower) || /qwen3-vl/i.test(lower);
}

/**
 * Detect if a model ID refers to a Gemma 4 multimodal ONNX model.
 * These use a split architecture (embed_tokens + vision_encoder + decoder_model_merged)
 * and require the VLM loading path with Gemma4ForConditionalGeneration.
 */
function isGemma4Model(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return lower.includes('gemma-4') || lower.includes('gemma4');
}

/**
 * Detect if a model ID refers to a GLM-OCR model.
 * Uses AutoModelForImageTextToText instead of AutoModelForCausalLM.
 */
function isGlmOcrModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return lower.includes('glm-ocr') || lower.includes('glm_ocr') || lower.includes('glmocr');
}

/**
 * Detect if a model ID refers to a LightOnOCR model.
 * Uses AutoModelForImageTextToText instead of AutoModelForCausalLM.
 */
function isLightOnOCRModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return lower.includes('lightonocr') || lower.includes('lighton-ocr') || lower.includes('lighton_ocr');
}

/**
 * Whether a model uses AutoModelForImageTextToText (generative OCR models).
 */
function isImageTextToTextModel(modelId: string): boolean {
  return isGlmOcrModel(modelId) || isLightOnOCRModel(modelId);
}

/**
 * Whether a model should use the VLM loading path (direct model class + processor).
 */
function isVLMModel(modelId: string): boolean {
  return isQwen35Model(modelId) || isQwenVLModel(modelId) || isGemma4Model(modelId) || isImageTextToTextModel(modelId);
}

/**
 * Internal wrapper that holds either a pipeline or a VLM model+tokenizer pair.
 * This abstraction lets doGenerate/doStream work the same way regardless of loading strategy.
 */
interface LoadedModel {
  type: 'pipeline' | 'vlm';
  /** For pipeline models */
  pipeline?: TextGenerationPipeline;
  /** For VLM models (Qwen3.5, Qwen3-VL, Qwen2.5-VL, GLM-OCR, LightOnOCR-2) */
  model?: unknown;
  tokenizer?: unknown;
  /** For VLM vision — processes images into model-compatible tensors */
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
    this.supportsVision = isVLMModel(baseModelId);
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
   * Lazily load the model. Auto-detects whether to use pipeline or VLM loading.
   * Deduplicates concurrent calls -- only one load occurs.
   * @internal
   */
  private async load(): Promise<LoadedModel> {
    if (this.loaded) return this.loaded;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      try {
        const device = this.getDevice();

        if (isImageTextToTextModel(this.baseModelId)) {
          return await this.loadImageTextToText(device);
        } else if (isVLMModel(this.baseModelId)) {
          return await this.loadVLM(device);
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
    const { pipeline, env } = await import('@huggingface/transformers');

    // Suppress ONNX runtime warnings about node execution providers
    env.backends.onnx.logLevel = 'error';

    const pipe = await pipeline('text-generation', this.baseModelId, {
      device,
      dtype: this.settings.dtype ?? 'q4',
      progress_callback: this.settings.onProgress,
    } as Record<string, unknown>);

    const result: LoadedModel = { type: 'pipeline', pipeline: pipe };
    this.loaded = result;
    return result;
  }

  /**
   * Load a VLM (vision-language model) using AutoModelForCausalLM + AutoTokenizer.
   *
   * Supports Qwen3.5, Qwen3-VL, and Qwen2.5-VL ONNX repos which share a
   * split architecture:
   * - embed_tokens (token embeddings)
   * - vision_encoder (image processing)
   * - decoder_model_merged (the actual LLM)
   *
   * Each component can be loaded with a different dtype (q4, fp16, etc.)
   * AutoModelForCausalLM auto-detects the VL architecture from config.json
   * and loads only embed_tokens + decoder_model_merged for text-only use.
   * @internal
   */
  private async loadVLM(device: string): Promise<LoadedModel> {
    const tjs = await import('@huggingface/transformers');

    // Suppress ONNX runtime warnings about node execution providers
    tjs.env.backends.onnx.logLevel = 'error';

    // Use the most efficient dtype for browser: q4 for text, fp16 for vision encoder
    const dtype = this.settings.dtype ?? {
      embed_tokens: 'q4',
      vision_encoder: 'fp16',
      decoder_model_merged: 'q4',
    };

    // Try the dedicated model class first for faster loading, then fall back
    // to AutoModelForCausalLM which auto-detects architecture from config.json.
    const modelOpts = {
      dtype,
      device,
      progress_callback: this.settings.onProgress,
    } as Record<string, unknown>;

    let loadModel: Promise<unknown>;
    if (isGemma4Model(this.baseModelId) &&
        (tjs as Record<string, unknown>).Gemma4ForConditionalGeneration) {
      loadModel = (tjs as { Gemma4ForConditionalGeneration: { from_pretrained: Function } })
        .Gemma4ForConditionalGeneration.from_pretrained(this.baseModelId, modelOpts);
    } else if (isQwen35Model(this.baseModelId) &&
        (tjs as Record<string, unknown>).Qwen3_5ForConditionalGeneration) {
      loadModel = (tjs as { Qwen3_5ForConditionalGeneration: { from_pretrained: Function } })
        .Qwen3_5ForConditionalGeneration.from_pretrained(this.baseModelId, modelOpts);
    } else {
      loadModel = tjs.AutoModelForCausalLM.from_pretrained(this.baseModelId, modelOpts);
    }

    const [tokenizer, processor, model] = await Promise.all([
      tjs.AutoTokenizer.from_pretrained(this.baseModelId, {
        progress_callback: this.settings.onProgress,
      } as Record<string, unknown>),
      tjs.AutoProcessor.from_pretrained(this.baseModelId, {
        progress_callback: this.settings.onProgress,
      } as Record<string, unknown>),
      loadModel,
    ]);

    const result: LoadedModel = { type: 'vlm', model, tokenizer, processor };
    this.loaded = result;
    return result;
  }

  /**
   * Load a generative OCR model using AutoModelForImageTextToText + AutoProcessor.
   *
   * Used for GLM-OCR and LightOnOCR-2 ONNX repos which use a different model
   * class from the Qwen VLM path but share the same generation flow.
   * @internal
   */
  private async loadImageTextToText(device: string): Promise<LoadedModel> {
    const tjs = await import('@huggingface/transformers');
    tjs.env.backends.onnx.logLevel = 'error';

    const dtype = this.settings.dtype ?? {
      embed_tokens: 'q4',
      vision_encoder: 'fp16',
      decoder_model_merged: 'q4',
    };

    const modelLoader = (tjs as Record<string, unknown>).AutoModelForImageTextToText
      ? (tjs as { AutoModelForImageTextToText: { from_pretrained: Function } })
          .AutoModelForImageTextToText.from_pretrained(this.baseModelId, {
            dtype,
            device,
            progress_callback: this.settings.onProgress,
          } as Record<string, unknown>)
      : tjs.AutoModelForCausalLM.from_pretrained(this.baseModelId, {
            dtype,
            device,
            progress_callback: this.settings.onProgress,
          } as Record<string, unknown>);

    const [processor, model] = await Promise.all([
      tjs.AutoProcessor.from_pretrained(this.baseModelId, {
        progress_callback: this.settings.onProgress,
      } as Record<string, unknown>),
      modelLoader,
    ]);

    const tokenizer = await tjs.AutoTokenizer.from_pretrained(this.baseModelId, {
      progress_callback: this.settings.onProgress,
    } as Record<string, unknown>);

    const result: LoadedModel = { type: 'vlm', model, processor, tokenizer };
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
      if (loaded.type === 'vlm') {
        return await this.generateVLM(loaded, chatMessages, {
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
   * Generate using VLM AutoModelForCausalLM + AutoTokenizer (Qwen3.5/Qwen3-VL/Qwen2.5-VL).
   * @internal
   */
  private async generateVLM(
    loaded: LoadedModel,
    chatMessages: Array<{ role: string; content: unknown }>,
    opts: { maxTokens: number; temperature: number; topP: number; startTime: number; images: unknown[] }
  ): Promise<DoGenerateResult> {
    const tjs = await import('@huggingface/transformers');
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

    // Count input tokens so we can slice them off the output
    const inputIds = inputs.input_ids as { dims?: number[]; tolist?: () => number[][] };
    const inputTokenCount = inputIds?.dims?.[1] ?? 0;

    // Generate
    const output = await model.generate({
      ...inputs,
      max_new_tokens: opts.maxTokens,
      temperature: opts.temperature > 0 ? opts.temperature : undefined,
      top_p: opts.topP,
      do_sample: opts.temperature > 0,
    });

    // Decode — slice off the input token IDs, decode only the generated tokens
    const outputArray = output as { tolist: () => number[][]; slice: Function; dims?: number[] };
    const allIds = outputArray.tolist ? outputArray.tolist() : [[]] as number[][];
    const generatedIds = inputTokenCount > 0
      ? allIds.map((seq: number[]) => seq.slice(inputTokenCount))
      : allIds;
    const decoded = tokenizer.batch_decode(generatedIds, { skip_special_tokens: true });
    const text = (Array.isArray(decoded) ? decoded[0] : String(decoded)).trim();

    const inputTokens = inputTokenCount || Math.ceil(
      chatMessages.map((m) => typeof m.content === 'string' ? m.content : '').join(' ').length / 4
    );
    const outputTokens = generatedIds[0]?.length ?? Math.ceil(text.length / 4);
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
   * For VLM models: uses model.generate with TextStreamer.
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
        if (loaded.type === 'vlm') {
          await this.streamVLM(loaded, chatMessages, {
            maxTokens, temperature, topP, streamer, images,
          });
        } else {
          // TJS v4 pipeline requires a TextStreamer instance for streaming
          const tjs = await import('@huggingface/transformers');
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
   * Stream VLM generation using model.generate with a callback streamer.
   * @internal
   */
  private async streamVLM(
    loaded: LoadedModel,
    chatMessages: Array<{ role: string; content: unknown }>,
    opts: { maxTokens: number; temperature: number; topP: number; streamer: (token: string) => void; images: unknown[] }
  ): Promise<void> {
    const tjs = await import('@huggingface/transformers');

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
        } else if (this.loaded.model) {
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
 * or VLM-specific loading based on the model ID.
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
