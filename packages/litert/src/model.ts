/**
 * LiteRT Language Model Implementation
 *
 * Implements the LanguageModel interface using LiteRT-LM (Google's on-device
 * inference engine). Runs `.litertlm` models in the browser. The LiteRT-LM JS
 * API is an early-preview, text-in / text-out runtime.
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
import type { LiteRTModelSettings } from './types.js';
import { LITERT_MODELS, type LiteRTModelEntry } from './models.js';
import { resolveModelUrl, fetchModelStream, isWebGPUDeviceUsable } from './utils.js';

type LiteRTEngine = Awaited<ReturnType<typeof import('@litert-lm/core').Engine.create>>;

/** A conversation message with text or structured content. */
interface InputMessage {
  role: string;
  content: string | ContentPart[];
}

/** Type-safe accessor for catalog entries. Returns undefined for unknown IDs. */
function getCatalogEntry(id: string): LiteRTModelEntry | undefined {
  return (LITERT_MODELS as Record<string, LiteRTModelEntry>)[id];
}

/** Extract the concatenated text of a message, ignoring non-text content parts. */
function extractText(content: string | ContentPart[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((p): p is Extract<ContentPart, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join(' ');
}

/** Whether the stopSequences warning has been emitted */
let stopSequencesWarningEmitted = false;

/**
 * LiteRT Language Model implementation.
 *
 * Uses LiteRT-LM (Google's on-device inference engine) for browser inference.
 * The engine loads on a WebGPU backend by default and falls back to the CPU
 * (WASM) backend automatically. This is a text-only model — the LiteRT-LM JS
 * API does not currently support vision or audio input.
 *
 * @example
 * ```ts
 * import { LiteRTLanguageModel } from '@localmode/litert';
 * import { generateText } from '@localmode/core';
 *
 * const model = new LiteRTLanguageModel('gemma-4-E2B', { temperature: 0.7 });
 * const { text } = await generateText({ model, prompt: 'Hello!' });
 * ```
 */
export class LiteRTLanguageModel implements LanguageModel {
  readonly modelId: string;
  readonly provider = 'litert';
  readonly contextLength: number;

  private engine: LiteRTEngine | null = null;
  private loadPromise: Promise<LiteRTEngine> | null = null;
  private baseModelId: string;
  private settings: LiteRTModelSettings;

  constructor(baseModelId: string, settings: LiteRTModelSettings = {}) {
    this.baseModelId = baseModelId;
    this.settings = settings;
    this.modelId = `litert:${baseModelId}`;

    const catalogEntry = getCatalogEntry(baseModelId);
    this.contextLength = settings.contextLength ?? catalogEntry?.contextLength ?? 4096;
  }

  private async loadEngine(): Promise<LiteRTEngine> {
    if (this.engine) {
      return this.engine;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      try {
        const catalogEntry = getCatalogEntry(this.baseModelId);

        // GPU-only models — their `.litertlm` build is GPU-compiled and cannot
        // run on the CPU backend. Fail fast with a clear error BEFORE
        // downloading multiple GB if WebGPU cannot be used.
        if (catalogEntry?.requiresWebGPU) {
          if (this.settings.backend === 'CPU') {
            throw new ModelLoadError(
              this.baseModelId,
              new Error(
                `${catalogEntry.name} requires WebGPU — its .litertlm build is GPU-compiled and cannot run on the CPU backend. Remove the backend: 'CPU' setting, or use a model that runs on CPU (e.g. qwen3-0.6B).`,
              ),
            );
          }
          if (!(await isWebGPUDeviceUsable())) {
            throw new ModelLoadError(
              this.baseModelId,
              new Error(
                `${catalogEntry.name} requires WebGPU, which is not available in this browser. Use a WebGPU-capable browser (Chrome/Edge 113+, Safari 26+), or use a model that runs on the CPU backend (e.g. qwen3-0.6B).`,
              ),
            );
          }
        }

        const modelUrl = resolveModelUrl(
          catalogEntry ? catalogEntry.url : this.baseModelId,
          this.settings.modelUrl,
        );

        this.settings.onProgress?.({
          status: 'initiate',
          progress: 0,
          text: 'Initializing LiteRT engine...',
        });

        // Fetch the model with real progress before handing the stream to the
        // engine. The Engine accepts a ReadableStream as its `model` source.
        const stream = await fetchModelStream(modelUrl, this.settings.onProgress);

        const { Backend } = await import('@litert-lm/core');

        // Backend selection: only pass an explicit backend when the caller set
        // one. Otherwise let LiteRT-LM pick its default (WebGPU when available).
        let explicitBackend: number | undefined;
        if (this.settings.backend === 'GPU') {
          explicitBackend = Backend.GPU;
        } else if (this.settings.backend === 'CPU') {
          explicitBackend = Backend.CPU;
        }

        this.settings.onProgress?.({
          status: 'progress',
          progress: 95,
          text: 'Initializing model',
        });

        const engine = await this.createEngine(
          modelUrl,
          stream,
          explicitBackend,
          catalogEntry?.requiresWebGPU === true,
        );

        this.settings.onProgress?.({ status: 'done', progress: 100, text: 'Model loaded' });
        this.settings.onProgress?.({ status: 'ready', progress: 100, text: 'Model ready for inference' });

        this.engine = engine;
        return engine;
      } catch (error) {
        this.loadPromise = null;

        if (error instanceof DOMException && error.name === 'AbortError') {
          throw error;
        }
        if (error instanceof ModelLoadError) {
          throw error;
        }

        throw new ModelLoadError(this.baseModelId, error instanceof Error ? error : new Error(String(error)));
      }
    })();

    return this.loadPromise;
  }

  /**
   * Create the LiteRT engine. If a default/GPU load fails because the pinned
   * `@litert-lm/core` build cannot stream-load this model on the GPU backend
   * ("Streaming ... is not supported yet"), retry once on the CPU backend —
   * unless the model is GPU-only, in which case a CPU retry cannot help.
   */
  private async createEngine(
    modelUrl: string,
    stream: ReadableStream<Uint8Array>,
    explicitBackend: number | undefined,
    requiresWebGPU: boolean,
  ): Promise<LiteRTEngine> {
    const { Engine, Backend } = await import('@litert-lm/core');
    try {
      return await Engine.create(
        explicitBackend !== undefined ? { model: stream, backend: explicitBackend } : { model: stream },
      );
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      if (!requiresWebGPU && explicitBackend !== Backend.CPU && /Streaming\s.*is not supported yet/i.test(msg)) {
        // Streams are single-use; re-fetch before retrying on CPU.
        this.settings.onProgress?.({
          status: 'progress',
          progress: 95,
          text: 'GPU streaming unsupported for this model — retrying on CPU',
        });
        const retryStream = await fetchModelStream(modelUrl, undefined);
        return Engine.create({ model: retryStream, backend: Backend.CPU });
      }
      throw err;
    }
  }

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

    this.warnUnsupportedStopSequences(stopSequences);

    abortSignal?.throwIfAborted();
    const engine = await this.loadEngine();
    abortSignal?.throwIfAborted();

    const startTime = Date.now();

    try {
      const conversationConfig = this.buildConversationConfig({
        systemPrompt,
        messages: messages as InputMessage[] | undefined,
        temperature,
        topP,
        maxTokens,
      });

      const conversation = await engine.createConversation(conversationConfig);

      const abortHandler = () => conversation.cancel();
      abortSignal?.addEventListener('abort', abortHandler, { once: true });

      try {
        const messageInput = this.buildMessageInput(prompt, messages as InputMessage[] | undefined);
        const response = await conversation.sendMessage(messageInput);

        const text = typeof response.content === 'string'
          ? response.content
          : (response.content ?? [])
              .filter((item: { type: string }) => item.type === 'text')
              .map((item: { text?: string }) => item.text ?? '')
              .join('');

        const inputTokens = Math.ceil(messageInput.length / 4);
        const outputTokens = Math.ceil(text.length / 4);

        return {
          text,
          finishReason: this.mapFinishReason(outputTokens >= maxTokens),
          usage: {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            durationMs: Date.now() - startTime,
          },
        };
      } finally {
        abortSignal?.removeEventListener('abort', abortHandler);
        await conversation.delete().catch(() => {});
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      if (error instanceof ModelLoadError) {
        throw error;
      }

      throw new GenerationError(
        `Text generation failed with model ${this.modelId}: ${(error as Error)?.message ?? String(error)}`,
        {
          hint: 'Check that the model loaded correctly and the prompt is valid.',
          cause: error instanceof Error ? error : undefined,
        },
      );
    }
  }

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

    this.warnUnsupportedStopSequences(stopSequences);

    abortSignal?.throwIfAborted();
    const engine = await this.loadEngine();
    abortSignal?.throwIfAborted();

    const startTime = Date.now();

    const conversationConfig = this.buildConversationConfig({
      systemPrompt,
      messages: messages as InputMessage[] | undefined,
      temperature,
      topP,
      maxTokens,
    });

    const conversation = await engine.createConversation(conversationConfig);

    const abortHandler = () => conversation.cancel();
    abortSignal?.addEventListener('abort', abortHandler, { once: true });

    try {
      const messageInput = this.buildMessageInput(prompt, messages as InputMessage[] | undefined);
      const stream = conversation.sendMessageStreaming(messageInput);
      const reader = stream.getReader();

      let outputTokens = 0;
      const inputTokens = Math.ceil(messageInput.length / 4);

      try {
        while (true) {
          abortSignal?.throwIfAborted();

          const { done, value } = await reader.read();

          if (done) {
            yield {
              text: '',
              done: true,
              finishReason: this.mapFinishReason(outputTokens >= maxTokens),
              usage: {
                inputTokens,
                outputTokens,
                totalTokens: inputTokens + outputTokens,
                durationMs: Date.now() - startTime,
              },
            };
            break;
          }

          // LiteRT-LM's `sendMessageStreaming()` yields delta `Message` chunks
          // — each chunk's `content` is ONLY the new text since the previous
          // chunk, not cumulative. Yield it as-is.
          const delta = typeof value.content === 'string'
            ? value.content
            : (value.content ?? [])
                .filter((item: { type: string }) => item.type === 'text')
                .map((item: { text?: string }) => item.text ?? '')
                .join('');

          if (delta.length > 0) {
            outputTokens += Math.ceil(delta.length / 4);
            yield { text: delta, done: false };
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }

      throw new GenerationError(
        `Streaming generation failed with model ${this.modelId}: ${(error as Error)?.message ?? String(error)}`,
        {
          hint: 'Check that the model loaded correctly and the prompt is valid.',
          cause: error instanceof Error ? error : undefined,
        },
      );
    } finally {
      abortSignal?.removeEventListener('abort', abortHandler);
      await conversation.delete().catch(() => {});
    }
  }

  /**
   * Unload the model and free WASM memory.
   */
  async unload(): Promise<void> {
    if (this.engine) {
      try {
        await this.engine.delete();
      } catch {
        // Ignore cleanup errors
      }
      this.engine = null;
      this.loadPromise = null;
    }
  }

  private warnUnsupportedStopSequences(stopSequences?: string[]): void {
    if (stopSequences?.length && !stopSequencesWarningEmitted) {
      stopSequencesWarningEmitted = true;
      console.warn(
        '[litert] stopSequences are not supported — LiteRT-LM uses token IDs internally. This option will be ignored.',
      );
    }
  }

  /**
   * Build the LiteRT `ConversationConfig`. Prior conversation turns become the
   * `preface`; the final turn is sent separately via `sendMessage()`.
   */
  private buildConversationConfig(options: {
    systemPrompt?: string;
    messages?: InputMessage[];
    temperature: number;
    topP: number;
    maxTokens: number;
  }) {
    const prefaceMessages: Array<{ role: string; content: string }> = [];

    const effectiveSystemPrompt = options.systemPrompt ?? this.settings.systemPrompt;
    if (effectiveSystemPrompt) {
      prefaceMessages.push({ role: 'system', content: effectiveSystemPrompt });
    }

    // History = every message except the final turn (which is sent separately).
    const history = options.messages ? options.messages.slice(0, -1) : [];
    for (const msg of history) {
      const text = extractText(msg.content);
      if (text) {
        prefaceMessages.push({ role: msg.role, content: text });
      }
    }

    const config: Record<string, unknown> = {
      sessionConfig: {
        samplerParams: {
          temperature: options.temperature,
          p: options.topP,
        },
        maxOutputTokens: options.maxTokens,
      },
    };

    if (prefaceMessages.length > 0) {
      config.preface = { messages: prefaceMessages };
    }

    return config;
  }

  /** Resolve the final user turn to send via `sendMessage()`. */
  private buildMessageInput(prompt: string, messages?: InputMessage[]): string {
    if (messages && messages.length > 0) {
      return extractText(messages[messages.length - 1].content) || prompt;
    }
    return prompt;
  }

  private mapFinishReason(reachedMaxTokens: boolean): FinishReason {
    return reachedMaxTokens ? 'length' : 'stop';
  }
}

/**
 * Create a LiteRT language model instance.
 *
 * @param modelId - Model identifier (catalog shorthand, HF shorthand, or full URL)
 * @param settings - Model settings
 * @returns LanguageModel instance
 *
 * @example
 * ```ts
 * import { createLanguageModel } from '@localmode/litert';
 * const model = createLanguageModel('gemma-4-E2B');
 * ```
 */
export function createLanguageModel(modelId: string, settings?: LiteRTModelSettings): LanguageModel {
  return new LiteRTLanguageModel(modelId, settings);
}
