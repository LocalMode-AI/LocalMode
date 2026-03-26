/**
 * wllama Language Model Implementation
 *
 * Implements LanguageModel interface using wllama (llama.cpp compiled to WASM).
 * Runs any standard GGUF model file in the browser without WebGPU.
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
import { ModelLoadError, GenerationError } from '@localmode/core';
import type { WllamaModelSettings, WllamaLoadProgress } from './types.js';
import { WLLAMA_MODELS } from './models.js';
import { isCrossOriginIsolated, resolveModelUrl } from './utils.js';
import { parseGGUFMetadata } from './gguf.js';

// Dynamic import type — Wllama class instance
type WllamaInstance = InstanceType<Awaited<typeof import('@wllama/wllama')>['Wllama']>;

/** Whether the single-thread CORS warning has been emitted */
let corsWarningEmitted = false;

/**
 * wllama Language Model implementation.
 *
 * Uses wllama (llama.cpp WASM) for GGUF model inference in the browser.
 * Works in all modern browsers without WebGPU — only WASM is required.
 *
 * @example
 * ```ts
 * import { WllamaLanguageModel } from '@localmode/wllama';
 * import { generateText } from '@localmode/core';
 *
 * const model = new WllamaLanguageModel(
 *   'bartowski/Llama-3.2-1B-Instruct-GGUF:Llama-3.2-1B-Instruct-Q4_K_M.gguf',
 *   { temperature: 0.7 }
 * );
 *
 * const { text } = await generateText({ model, prompt: 'Hello!' });
 * ```
 */
export class WllamaLanguageModel implements LanguageModel {
  readonly modelId: string;
  readonly provider = 'wllama';
  contextLength: number;

  private wllamaInstance: WllamaInstance | null = null;
  private loadPromise: Promise<WllamaInstance> | null = null;
  private baseModelId: string;
  private settings: WllamaModelSettings;

  constructor(baseModelId: string, settings: WllamaModelSettings = {}) {
    this.baseModelId = baseModelId;
    this.settings = settings;
    this.modelId = `wllama:${baseModelId}`;
    // Initial context length from settings or default; may be updated from GGUF metadata
    this.contextLength = settings.contextLength ?? 4096;
  }

  /**
   * Load the wllama engine and GGUF model.
   *
   * Deduplicates concurrent calls — only one model load occurs.
   * @internal
   */
  private async loadModel(): Promise<WllamaInstance> {
    if (this.wllamaInstance) {
      return this.wllamaInstance;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      try {
        const { Wllama } = await import('@wllama/wllama');

        // Determine model URL
        const catalogEntry = (WLLAMA_MODELS as Record<string, { url: string; contextLength: number }>)[this.baseModelId];
        const modelUrl = resolveModelUrl(
          catalogEntry ? catalogEntry.url : this.baseModelId,
          this.settings.modelUrl
        );

        // Auto-detect context length from GGUF metadata if not explicitly set
        if (!this.settings.contextLength) {
          try {
            if (catalogEntry) {
              // Use catalog context length
              this.contextLength = catalogEntry.contextLength;
            } else {
              // Parse GGUF metadata for context length
              const metadata = await parseGGUFMetadata(modelUrl);
              if (metadata.contextLength > 0) {
                this.contextLength = metadata.contextLength;
              }
            }
          } catch {
            // Silently fall back to default (4096), already set in constructor
          }
        }

        // Determine thread count
        let numThreads = this.settings.numThreads;
        if (numThreads === undefined) {
          if (isCrossOriginIsolated()) {
            numThreads = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 1;
          } else {
            numThreads = 1;
            if (!corsWarningEmitted) {
              corsWarningEmitted = true;
              console.warn(
                '[wllama] Running in single-threaded mode. For 2-4x faster inference, add CORS headers:\n' +
                '  Cross-Origin-Opener-Policy: same-origin\n' +
                '  Cross-Origin-Embedder-Policy: require-corp'
              );
            }
          }
        }

        // Report initiation
        this.settings.onProgress?.({
          status: 'initiate',
          text: `Loading GGUF model: ${this.baseModelId}`,
        });

        // Instantiate wllama with CDN-hosted WASM binaries
        const wllamaInstance = new Wllama({
          'single-thread/wllama.wasm': 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2/src/single-thread/wllama.wasm',
          'multi-thread/wllama.wasm': 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2/src/multi-thread/wllama.wasm',
        });

        // Load the GGUF model
        await wllamaInstance.loadModelFromUrl(modelUrl, {
          n_threads: numThreads,
          n_ctx: this.contextLength,
          progressCallback: (opts: { loaded: number; total: number }) => {
            if (this.settings.onProgress) {
              const pct = opts.total > 0 ? (opts.loaded / opts.total) * 100 : 0;
              const isDone = pct >= 100;
              const progress: WllamaLoadProgress = {
                status: isDone ? 'done' : 'download',
                progress: Math.min(pct, 100),
                loaded: opts.loaded,
                total: opts.total,
                text: isDone
                  ? 'Model loaded'
                  : `Downloading: ${(opts.loaded / (1024 * 1024)).toFixed(1)}MB / ${(opts.total / (1024 * 1024)).toFixed(1)}MB`,
              };
              this.settings.onProgress(progress);
            }
          },
        });

        // Report ready
        this.settings.onProgress?.({
          status: 'ready',
          progress: 100,
          text: 'Model ready for inference',
        });

        this.wllamaInstance = wllamaInstance;
        return wllamaInstance;
      } catch (error) {
        // Reset load promise so retry is possible
        this.loadPromise = null;

        // Re-throw abort errors as-is
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw error;
        }

        // Re-throw ModelLoadError as-is (from GGUF metadata parsing)
        if (error instanceof ModelLoadError) {
          throw error;
        }

        const cause = error instanceof Error ? error : undefined;
        throw new ModelLoadError(this.baseModelId, cause);
      }
    })();

    return this.loadPromise;
  }

  /**
   * Build a prompt string from the options.
   *
   * If a wllama instance with a chat template is available, we use
   * `formatChat()`. Otherwise we build a simple concatenated prompt.
   * @internal
   */
  private buildPrompt(options: {
    prompt: string;
    systemPrompt?: string;
    messages?: Array<{ role: string; content: string }>;
  }): string {
    const parts: string[] = [];

    // System prompt
    const systemPrompt = options.systemPrompt ?? this.settings.systemPrompt;
    if (systemPrompt) {
      parts.push(systemPrompt);
      parts.push('');
    }

    // Chat messages
    if (options.messages && options.messages.length > 0) {
      for (const msg of options.messages) {
        parts.push(`${msg.role}: ${msg.content}`);
      }
    }

    // User prompt
    parts.push(options.prompt);

    return parts.join('\n');
  }

  /**
   * Build a sampling config from generation options.
   * @internal
   */
  private buildSamplingConfig(
    temperature: number,
    topP: number,
    providerOptions: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      temp: temperature,
      top_p: topP,
      top_k: providerOptions.top_k as number | undefined,
      penalty_repeat: providerOptions.repeat_penalty as number | undefined,
      penalty_last_n: providerOptions.repeat_last_n as number | undefined,
      mirostat: providerOptions.mirostat as number | undefined,
      mirostat_tau: providerOptions.mirostat_tau as number | undefined,
      mirostat_eta: providerOptions.mirostat_eta as number | undefined,
    };
  }

  /**
   * Map stop reasons to core FinishReason type.
   * @internal
   */
  private mapFinishReason(reachedMaxTokens: boolean): FinishReason {
    if (reachedMaxTokens) {
      return 'length';
    }
    return 'stop';
  }

  /**
   * Convert stop sequences to token IDs via the wllama tokenizer.
   * @internal
   */
  private async resolveStopTokens(
    instance: WllamaInstance,
    stopSequences?: string[]
  ): Promise<number[]> {
    if (!stopSequences || stopSequences.length === 0) {
      return [];
    }
    const stopTokens: number[] = [];
    for (const seq of stopSequences) {
      try {
        const tokenId = await instance.lookupToken(seq);
        if (tokenId >= 0) {
          stopTokens.push(tokenId);
        }
      } catch {
        // Token not found in vocab — skip
      }
    }
    return stopTokens;
  }

  /**
   * Generate text from a prompt.
   *
   * @param options - Generation options
   * @returns Promise with generation result
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
      providerOptions,
    } = options;

    abortSignal?.throwIfAborted();

    const wllamaInstance = await this.loadModel();

    abortSignal?.throwIfAborted();

    const startTime = Date.now();

    // Normalize messages to plain string content for buildPrompt
    const textMessages = messages?.map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : m.content.filter((p) => p.type === 'text').map((p) => (p as { type: 'text'; text: string }).text).join('\n'),
    }));

    // Build the full prompt
    const fullPrompt = this.buildPrompt({ prompt, systemPrompt, messages: textMessages });

    // Extract wllama-specific options
    const wllamaOpts = (providerOptions?.wllama ?? {}) as Record<string, unknown>;

    // Build sampling config
    const sampling = this.buildSamplingConfig(temperature, topP, wllamaOpts);

    try {
      // Count input tokens
      let inputTokens = 0;
      try {
        const inputTokenArr = await wllamaInstance.tokenize(fullPrompt);
        inputTokens = inputTokenArr.length;
      } catch {
        inputTokens = Math.ceil(fullPrompt.length / 4);
      }

      // Resolve stop sequences to token IDs
      const stopTokens = await this.resolveStopTokens(wllamaInstance, stopSequences);

      // Initialize sampling context
      await wllamaInstance.samplingInit(sampling);

      // Generate completion
      let outputTokens = 0;
      const text = await wllamaInstance.createCompletion(fullPrompt, {
        nPredict: maxTokens,
        sampling,
        stopTokens: stopTokens.length > 0 ? stopTokens : undefined,
        abortSignal,
        onNewToken: () => {
          outputTokens++;
        },
      });

      // Determine finish reason
      const reachedMaxTokens = outputTokens >= maxTokens;
      const finishReason = this.mapFinishReason(reachedMaxTokens);

      return {
        text,
        finishReason,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          durationMs: Date.now() - startTime,
        },
      };
    } catch (error) {
      // Re-throw abort errors
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      // wllama has its own WllamaAbortError
      if (error instanceof Error && error.constructor.name === 'WllamaAbortError') {
        throw error;
      }

      const cause = error instanceof Error ? error : undefined;
      throw new GenerationError(
        `Text generation failed with model ${this.modelId}: ${cause?.message ?? String(error)}`,
        {
          hint: 'Check that the model loaded correctly and the prompt is valid.',
          cause,
        }
      );
    }
  }

  /**
   * Stream text generation token by token.
   *
   * Uses wllama's `onNewToken` callback wrapped in an AsyncGenerator.
   *
   * @param options - Stream options
   * @returns AsyncIterable of stream chunks
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
      providerOptions,
    } = options;

    abortSignal?.throwIfAborted();

    const wllamaInstance = await this.loadModel();

    abortSignal?.throwIfAborted();

    const startTime = Date.now();

    // Normalize messages to plain string content for buildPrompt
    const textMessages = messages?.map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : m.content.filter((p) => p.type === 'text').map((p) => (p as { type: 'text'; text: string }).text).join('\n'),
    }));

    // Build the full prompt
    const fullPrompt = this.buildPrompt({ prompt, systemPrompt, messages: textMessages });

    // Extract wllama-specific options
    const wllamaOpts = (providerOptions?.wllama ?? {}) as Record<string, unknown>;

    // Build sampling config
    const sampling = this.buildSamplingConfig(temperature, topP, wllamaOpts);

    // Count input tokens
    let inputTokens = 0;
    try {
      const inputTokenArr = await wllamaInstance.tokenize(fullPrompt);
      inputTokens = inputTokenArr.length;
    } catch {
      inputTokens = Math.ceil(fullPrompt.length / 4);
    }

    // Resolve stop sequences to token IDs
    const stopTokens = await this.resolveStopTokens(wllamaInstance, stopSequences);

    // Initialize sampling context
    await wllamaInstance.samplingInit(sampling);

    // Promise-based queue for streaming tokens from callback to generator
    type QueueItem = { token: string; done: boolean };
    const queue: QueueItem[] = [];
    let resolveWaiting: ((item: QueueItem) => void) | null = null;
    let outputTokens = 0;
    const state: { error: Error | null } = { error: null };

    // Push a token to the queue or resolve a waiting consumer
    const pushToken = (item: QueueItem) => {
      if (resolveWaiting) {
        const resolve = resolveWaiting;
        resolveWaiting = null;
        resolve(item);
      } else {
        queue.push(item);
      }
    };

    // Pull a token from the queue, waiting if necessary
    const pullToken = (): Promise<QueueItem> => {
      if (queue.length > 0) {
        return Promise.resolve(queue.shift()!);
      }
      return new Promise<QueueItem>((resolve) => {
        resolveWaiting = resolve;
      });
    };

    // Start generation in the background
    const completionPromise = wllamaInstance
      .createCompletion(fullPrompt, {
        nPredict: maxTokens,
        sampling,
        stopTokens: stopTokens.length > 0 ? stopTokens : undefined,
        abortSignal,
        onNewToken: (_token: number, _piece: Uint8Array, currentText: string) => {
          outputTokens++;
          // wllama's onNewToken gives the full text so far
          pushToken({ token: currentText, done: false });
        },
      })
      .then(() => {
        pushToken({ token: '', done: true });
      })
      .catch((error: unknown) => {
        state.error = error instanceof Error ? error : new Error(String(error));
        pushToken({ token: '', done: true });
      });

    // Track the previous text to extract deltas
    let previousText = '';

    try {
      while (true) {
        abortSignal?.throwIfAborted();

        const item = await pullToken();

        if (item.done) {
          // Check if an error occurred during generation
          if (state.error) {
            // Re-throw abort errors
            if (state.error.name === 'AbortError' || state.error.constructor.name === 'WllamaAbortError') {
              throw state.error;
            }
            throw new GenerationError(
              `Streaming generation failed with model ${this.modelId}: ${state.error.message}`,
              {
                hint: 'Check that the model loaded correctly and the prompt is valid.',
                cause: state.error,
              }
            );
          }

          // Final chunk with usage
          const reachedMaxTokens = outputTokens >= maxTokens;
          const finishReason = this.mapFinishReason(reachedMaxTokens);

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

        // Extract delta from cumulative text
        const delta = item.token.slice(previousText.length);
        previousText = item.token;

        if (delta.length > 0) {
          yield {
            text: delta,
            done: false,
          };
        }
      }
    } finally {
      // Ensure the completion promise is awaited to avoid unhandled rejections
      await completionPromise.catch(() => {});
    }
  }

  /**
   * Unload the model and free WASM memory.
   *
   * After unloading, the next `doGenerate()` or `doStream()` call
   * will trigger a fresh model load.
   */
  async unload(): Promise<void> {
    if (this.wllamaInstance) {
      try {
        await this.wllamaInstance.exit();
      } catch {
        // Ignore errors during cleanup
      }
      this.wllamaInstance = null;
      this.loadPromise = null;
    }
  }
}

/**
 * Create a wllama language model.
 *
 * @param modelId - GGUF model identifier (catalog key, HuggingFace shorthand, or full URL)
 * @param settings - Model settings
 * @returns A WllamaLanguageModel instance
 *
 * @example
 * ```ts
 * import { createLanguageModel } from '@localmode/wllama';
 *
 * const model = createLanguageModel(
 *   'bartowski/Llama-3.2-1B-Instruct-GGUF:Llama-3.2-1B-Instruct-Q4_K_M.gguf',
 *   { temperature: 0.5 }
 * );
 * ```
 */
export function createLanguageModel(
  modelId: string,
  settings?: WllamaModelSettings
): WllamaLanguageModel {
  return new WllamaLanguageModel(modelId, settings);
}
