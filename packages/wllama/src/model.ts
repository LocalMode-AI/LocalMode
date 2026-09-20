/**
 * wllama Language Model Implementation
 *
 * Implements LanguageModel interface using wllama v3 (llama.cpp compiled to WASM).
 * Uses the OAI-compatible API (createChatCompletion / createCompletion).
 * Supports WebGPU acceleration, multimodal vision input, tool calling,
 * and native Jinja chat templates.
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

import {
  createOffloadCapturingLogger,
  importWllama,
  WLLAMA_CDN_WASM,
  type OffloadedLayers,
  type WllamaInstance,
} from './wllama-loader.js';

let corsWarningEmitted = false;

/**
 * Cap applied to the DEFAULT context length inferred from the model catalog
 * or GGUF metadata (never to an explicit `settings.contextLength`).
 *
 * The wllama runtime is wasm32: the whole process — model weights AND the
 * KV cache sized by `n_ctx` — must fit in a 4GiB heap. Long-context models
 * advertise native windows like 131072 tokens, whose KV cache alone is
 * multi-GiB (e.g. DeepSeek-R1-Distill-Qwen-1.5B: 131072 tokens ≈ 3.5GiB →
 * `ggml_aligned_malloc: insufficient memory` abort at load). 8192 keeps the
 * default KV cache in the low hundreds of MB for small models while staying
 * a useful window; callers that know their memory budget can still pass any
 * `contextLength` explicitly.
 */
const DEFAULT_MAX_CONTEXT = 8192;


/**
 * Resolve the WASM asset path for the current environment.
 * @internal
 */
export function resolveWasmPath(): { default: string } {
  if (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as { chrome?: { runtime?: { getURL?: (p: string) => string } } }).chrome
      ?.runtime?.getURL === 'function'
  ) {
    const get = (globalThis as unknown as {
      chrome: { runtime: { getURL: (p: string) => string } };
    }).chrome.runtime.getURL;
    return { default: get('wllama-wasm/wllama.wasm') };
  }
  return { default: WLLAMA_CDN_WASM };
}

/** Whether the page exposes WebGPU (wllama offloads to it by default when it does). */
function webgpuPresent(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator && Boolean((navigator as { gpu?: unknown }).gpu);
}

/**
 * Resolve the `n_gpu_layers` to hand wllama. wllama 3.5 offloads every layer
 * to WebGPU by default (n_gpu_layers 99999) whenever `navigator.gpu` exists,
 * so `undefined` here means "wllama's default, GPU when available";
 * `useWebGPU: false` must pin 0 explicitly or it changes nothing.
 * @internal
 */
export function resolveGpuLayers(settings: {
  nGpuLayers?: number;
  useWebGPU?: boolean | 'auto';
}): number | undefined {
  if (settings.nGpuLayers !== undefined) return settings.nGpuLayers;
  if (settings.useWebGPU === false) return 0;
  if (settings.useWebGPU === true) {
    if (webgpuPresent()) return -1;
    console.warn('[wllama] WebGPU requested but not available, falling back to WASM');
    return 0;
  }
  // 'auto' and unset: wllama decides (GPU when navigator.gpu exists).
  return undefined;
}

/** What a load will do before it has happened: GPU unless pinned off or absent. */
export function predictGpuAccelerated(settings: { nGpuLayers?: number; useWebGPU?: boolean | 'auto' }): boolean {
  const layers = resolveGpuLayers(settings);
  if (layers !== undefined) return layers !== 0 && webgpuPresent();
  return webgpuPresent();
}

/**
 * The vision projector a model loads with: an explicit `mmprojUrl`, else the
 * catalog's projector for models that ship one, and nothing when the caller
 * opted out with `vision: false` (text-only: no projector download, no
 * projector memory, and wllama's model cache stays enabled).
 */
export function resolveMmprojUrl(
  baseModelId: string,
  settings: Pick<WllamaModelSettings, 'mmprojUrl' | 'vision'>
): string | undefined {
  if (settings.vision === false) return undefined;
  if (settings.mmprojUrl) return settings.mmprojUrl;
  const entry = (WLLAMA_MODELS as Record<string, { vision?: boolean; mmprojUrl?: string }>)[baseModelId];
  return entry?.vision && entry?.mmprojUrl ? entry.mmprojUrl : undefined;
}

/**
 * wllama Language Model implementation.
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
  readonly supportsVision: boolean;
  contextLength: number;

  /**
   * Layers llama.cpp reported offloading to the GPU once the model loaded
   * (`load_tensors: offloaded N/M layers to GPU`), null before load or when
   * the runtime printed no such line.
   */
  offloadedLayers: OffloadedLayers | null = null;

  private wllamaInstance: WllamaInstance | null = null;
  private loadPromise: Promise<WllamaInstance> | null = null;
  private baseModelId: string;
  private settings: WllamaModelSettings;

  constructor(baseModelId: string, settings: WllamaModelSettings = {}) {
    this.baseModelId = baseModelId;
    this.settings = settings;
    this.modelId = `wllama:${baseModelId}`;
    this.contextLength = settings.contextLength ?? 4096;

    this.supportsVision = resolveMmprojUrl(baseModelId, settings) !== undefined;
  }

  /**
   * Whether inference runs on WebGPU. After the model loads this follows what
   * llama.cpp reported (any layer offloaded); before that it is the prediction
   * from the settings and `navigator.gpu`. wllama offloads by default when
   * WebGPU exists, so only `useWebGPU: false` or `nGpuLayers: 0` keep it off.
   */
  get gpuAccelerated(): boolean {
    if (this.offloadedLayers) return this.offloadedLayers.gpu > 0;
    return predictGpuAccelerated(this.settings);
  }

  /** @internal */
  private async loadModel(): Promise<WllamaInstance> {
    if (this.wllamaInstance) return this.wllamaInstance;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      try {
        const { Wllama } = await importWllama();

        const catalogEntry = (WLLAMA_MODELS as Record<string, { url: string; contextLength: number; mmprojUrl?: string }>)[this.baseModelId];
        const modelUrl = resolveModelUrl(
          catalogEntry ? catalogEntry.url : this.baseModelId,
          this.settings.modelUrl
        );

        if (!this.settings.contextLength) {
          try {
            if (catalogEntry) {
              this.contextLength = Math.min(catalogEntry.contextLength, DEFAULT_MAX_CONTEXT);
            } else {
              const metadata = await parseGGUFMetadata(modelUrl);
              if (metadata.contextLength > 0) {
                this.contextLength = Math.min(metadata.contextLength, DEFAULT_MAX_CONTEXT);
              }
            }
          } catch { /* fall back to 4096 */ }
        }

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

        this.settings.onProgress?.({
          status: 'initiate',
          text: `Loading GGUF model: ${this.baseModelId}`,
        });

        const offloadCapture = createOffloadCapturingLogger();
        const wllamaInstance = new Wllama(resolveWasmPath(), { logger: offloadCapture.logger });

        const mmprojUrl = resolveMmprojUrl(this.baseModelId, this.settings);
        const modelSource = mmprojUrl ? { url: modelUrl, mmprojUrl } : modelUrl;
        const gpuLayers = resolveGpuLayers(this.settings);

        const hasMmproj = typeof modelSource === 'object' && 'mmprojUrl' in modelSource;
        await wllamaInstance.loadModelFromUrl(modelSource, {
          n_threads: numThreads,
          n_ctx: this.contextLength,
          jinja: this.settings.useJinja !== false,
          ...(gpuLayers !== undefined ? { n_gpu_layers: gpuLayers } : {}),
          ...(hasMmproj ? { useCache: false } : {}),
          ...(this.settings.reasoning !== undefined ? { reasoning: this.settings.reasoning } : {}),
          ...(this.settings.reasoningFormat ? { reasoning_format: this.settings.reasoningFormat } : {}),
          ...(this.settings.reasoningBudgetTokens !== undefined ? { reasoning_budget_tokens: this.settings.reasoningBudgetTokens } : {}),
          ...(this.settings.cacheTypeK ? { cache_type_k: this.settings.cacheTypeK } : {}),
          ...(this.settings.cacheTypeV ? { cache_type_v: this.settings.cacheTypeV } : {}),
          ...(this.settings.flashAttention !== undefined ? { flash_attn: this.settings.flashAttention } : {}),
          ...(this.settings.specDraftModel ? { spec_draft_model: this.settings.specDraftModel } : {}),
          ...(this.settings.specDraftNgl !== undefined ? { spec_draft_ngl: this.settings.specDraftNgl } : {}),
          ...(this.settings.specDraftNMin !== undefined ? { spec_draft_n_min: this.settings.specDraftNMin } : {}),
          ...(this.settings.specDraftNMax !== undefined ? { spec_draft_n_max: this.settings.specDraftNMax } : {}),
          ...(this.settings.specDraftPMin !== undefined ? { spec_draft_p_min: this.settings.specDraftPMin } : {}),
          ...(this.settings.loraAdapters ? { lora_adapters: this.settings.loraAdapters } : {}),
          ...(this.settings.loraInitWithoutApply !== undefined ? { lora_init_without_apply: this.settings.loraInitWithoutApply } : {}),
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

        this.offloadedLayers = offloadCapture.offloaded;

        this.settings.onProgress?.({
          status: 'ready',
          progress: 100,
          text: 'Model ready for inference',
        });

        this.wllamaInstance = wllamaInstance;
        return wllamaInstance;
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

  /** @internal */
  private buildSamplingParams(
    temperature: number,
    topP: number,
    wllamaOpts: Record<string, unknown>
  ): Record<string, unknown> {
    const params: Record<string, unknown> = { temp: temperature, top_p: topP };
    if (wllamaOpts.top_k != null) params.top_k = wllamaOpts.top_k;
    if (wllamaOpts.repeat_penalty != null) params.penalty_repeat = wllamaOpts.repeat_penalty;
    if (wllamaOpts.repeat_last_n != null) params.penalty_last_n = wllamaOpts.repeat_last_n;
    if (wllamaOpts.mirostat != null) params.mirostat = wllamaOpts.mirostat;
    if (wllamaOpts.mirostat_tau != null) params.mirostat_tau = wllamaOpts.mirostat_tau;
    if (wllamaOpts.mirostat_eta != null) params.mirostat_eta = wllamaOpts.mirostat_eta;
    if (wllamaOpts.min_p != null) params.min_p = wllamaOpts.min_p;
    if (wllamaOpts.seed != null) params.seed = wllamaOpts.seed;
    if (wllamaOpts.penalty_freq != null) params.penalty_freq = wllamaOpts.penalty_freq;
    if (wllamaOpts.penalty_present != null) params.penalty_present = wllamaOpts.penalty_present;
    if (wllamaOpts.typ_p != null) params.typ_p = wllamaOpts.typ_p;
    if (wllamaOpts.dynatemp_range != null) params.dynatemp_range = wllamaOpts.dynatemp_range;
    if (wllamaOpts.dynatemp_exponent != null) params.dynatemp_exponent = wllamaOpts.dynatemp_exponent;
    if (wllamaOpts.logit_bias != null) params.logit_bias = wllamaOpts.logit_bias;
    if (wllamaOpts.samplers_sequence != null) params.samplers_sequence = wllamaOpts.samplers_sequence;
    if (wllamaOpts.n_probs != null) params.n_probs = wllamaOpts.n_probs;
    if (wllamaOpts.grammar != null) params.grammar = wllamaOpts.grammar;
    return params;
  }

  /** @internal */
  private mapFinishReason(reason: string | null): FinishReason {
    if (reason === 'length') return 'length';
    return 'stop';
  }

  /** @internal */
  private handleGenerationError(error: unknown): never {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (error instanceof Error && error.name === 'AbortError') throw error;
    if (error instanceof Error && error.constructor.name === 'WllamaAbortError') throw error;

    const cause = error instanceof Error ? error : undefined;
    throw new GenerationError(
      `Text generation failed with model ${this.modelId}: ${cause?.message ?? String(error)}`,
      { hint: 'Check that the model loaded correctly and the prompt is valid.', cause }
    );
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
      providerOptions,
    } = options;

    abortSignal?.throwIfAborted();
    const wllamaInstance = await this.loadModel();
    abortSignal?.throwIfAborted();

    const startTime = Date.now();
    const wllamaOpts = (providerOptions?.wllama ?? {}) as Record<string, unknown>;
    const sampling = this.buildSamplingParams(temperature, topP, wllamaOpts);

    try {
      if (this.useChatPath(wllamaInstance, messages, systemPrompt, wllamaOpts)) {
        const oaiMessages = this.buildOAIMessages(messages, systemPrompt, prompt);
        const responseFormat = wllamaOpts.response_format as Record<string, unknown> | undefined;

        const response = await wllamaInstance.createChatCompletion({
          messages: oaiMessages,
          max_tokens: maxTokens,
          ...(responseFormat ? { response_format: responseFormat } : {}),
          ...this.buildChatPassthrough(wllamaOpts),
          ...sampling,
        } as never);

        const choice = response.choices?.[0];
        const msg = choice?.message as unknown as Record<string, unknown> | undefined;
        const text = (msg?.content as string) || (msg?.reasoning_content as string) || '';
        const finishReason = this.mapFinishReason(choice?.finish_reason ?? null);
        const usage = response.usage;

        return {
          text,
          finishReason,
          usage: {
            inputTokens: usage?.prompt_tokens ?? Math.ceil(prompt.length / 4),
            outputTokens: usage?.completion_tokens ?? Math.ceil(text.length / 4),
            totalTokens: usage?.total_tokens ?? 0,
            durationMs: Date.now() - startTime,
          },
        };
      } else {
        const response = await wllamaInstance.createCompletion({
          prompt,
          max_tokens: maxTokens,
          ...(stopSequences && stopSequences.length > 0 ? { stop: stopSequences } : {}),
          ...sampling,
        } as never);

        const choice = response.choices?.[0];
        const text = choice?.text ?? '';
        const finishReason = this.mapFinishReason(choice?.finish_reason ?? null);
        const usage = response.usage;

        return {
          text,
          finishReason,
          usage: {
            inputTokens: usage?.prompt_tokens ?? Math.ceil(prompt.length / 4),
            outputTokens: usage?.completion_tokens ?? Math.ceil(text.length / 4),
            totalTokens: usage?.total_tokens ?? 0,
            durationMs: Date.now() - startTime,
          },
        };
      }
    } catch (error) {
      this.handleGenerationError(error);
    }
  }

  /**
   * @internal Non-sampling chat-completion options forwarded verbatim.
   * `cache_prompt: false` disables llama.cpp's prompt-KV reuse across
   * requests (on by default), which otherwise makes a repeated prompt skip
   * prefill entirely; `chat_template_kwargs` reach the Jinja template.
   */
  private buildChatPassthrough(wllamaOpts: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (typeof wllamaOpts.cache_prompt === 'boolean') out.cache_prompt = wllamaOpts.cache_prompt;
    if (wllamaOpts.chat_template_kwargs && typeof wllamaOpts.chat_template_kwargs === 'object') {
      out.chat_template_kwargs = wllamaOpts.chat_template_kwargs;
    }
    return out;
  }

  /**
   * @internal Decide between the chat-template path (`createChatCompletion`)
   * and raw untemplated completion (`createCompletion`).
   *
   * A bare `prompt` is a user turn, exactly as the webllm, transformers, and
   * litert providers treat it, so an instruct GGUF gets its chat template
   * applied and real token streaming. Raw completion is used only when the
   * caller asks for it (`providerOptions.wllama.raw`) or the GGUF ships no
   * chat template (a base model), where wrapping the prompt would be wrong.
   */
  private useChatPath(
    wllamaInstance: { getChatTemplate?: () => string | null },
    messages: DoGenerateOptions['messages'],
    systemPrompt: string | undefined,
    wllamaOpts: Record<string, unknown>,
  ): boolean {
    if ((messages && messages.length > 0) || !!systemPrompt) return true;
    if (wllamaOpts.raw === true) return false;
    return typeof wllamaInstance.getChatTemplate === 'function' && !!wllamaInstance.getChatTemplate();
  }

  /** @internal Build OAI-format messages from core messages/systemPrompt/prompt */
  private buildOAIMessages(
    messages: DoGenerateOptions['messages'],
    systemPrompt: string | undefined,
    prompt: string
  ) {
    type WllamaContentPart = { type: 'text'; text: string } | { type: 'image'; data: ArrayBuffer } | { type: 'audio'; data: ArrayBuffer };
    type WllamaContent = string | WllamaContentPart[];
    const oaiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: WllamaContent }> = [];
    const sysPrompt = systemPrompt ?? this.settings.systemPrompt;
    if (sysPrompt) oaiMessages.push({ role: 'system', content: sysPrompt });
    if (messages) {
      for (const m of messages) {
        if (typeof m.content === 'string') {
          if (m.content) oaiMessages.push({ role: m.role as 'user' | 'assistant', content: m.content });
        } else if (Array.isArray(m.content)) {
          const hasMedia = m.content.some((p) => (p.type === 'image' && this.supportsVision) || p.type === 'audio');
          if (hasMedia) {
            const parts: WllamaContentPart[] = [];
            for (const p of m.content) {
              if (p.type === 'text') {
                parts.push({ type: 'text', text: (p as { text: string }).text });
              } else if (p.type === 'image' && this.supportsVision) {
                const img = p as { data: string; mimeType: string };
                const binaryStr = atob(img.data);
                const bytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
                parts.push({ type: 'image', data: bytes.buffer });
              } else if (p.type === 'audio') {
                const audio = p as { data: string; mimeType: string };
                const binaryStr = atob(audio.data);
                const bytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
                parts.push({ type: 'audio', data: bytes.buffer });
              }
            }
            if (parts.length > 0) oaiMessages.push({ role: m.role as 'user' | 'assistant', content: parts });
          } else {
            const text = m.content.filter((p) => p.type === 'text').map((p) => (p as { text: string }).text).join('\n');
            if (text) oaiMessages.push({ role: m.role as 'user' | 'assistant', content: text });
          }
        }
      }
    }
    if (prompt) oaiMessages.push({ role: 'user', content: prompt });
    return oaiMessages;
  }

  /**
   * Stream text generation token-by-token via wllama v3's streaming API.
   * Uses `createChatCompletion({ stream: true })` whenever the request goes
   * through the chat template (messages, a system prompt, or a bare prompt on
   * a model that ships a template). Raw untemplated completion
   * (`providerOptions.wllama.raw`, or a base GGUF without a template) has no
   * streaming surface and is delivered as a single chunk.
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
      providerOptions,
    } = options;

    abortSignal?.throwIfAborted();
    const wllamaInstance = await this.loadModel();
    abortSignal?.throwIfAborted();

    const startTime = Date.now();
    const wllamaOpts = (providerOptions?.wllama ?? {}) as Record<string, unknown>;
    const sampling = this.buildSamplingParams(temperature, topP, wllamaOpts);
    const responseFormat = wllamaOpts.response_format as Record<string, unknown> | undefined;

    if (!this.useChatPath(wllamaInstance, messages, systemPrompt, wllamaOpts)) {
      // Raw completion has no streaming surface: deliver the whole text once.
      const result = await this.doGenerate(options);
      if (result.text) yield { text: result.text, done: false };
      yield { text: '', done: true, finishReason: result.finishReason, usage: result.usage };
      return;
    }

    try {
      const oaiMessages = this.buildOAIMessages(messages, systemPrompt, prompt);

      const stream = await wllamaInstance.createChatCompletion({
        messages: oaiMessages,
        max_tokens: maxTokens,
        stream: true,
        ...(responseFormat ? { response_format: responseFormat } : {}),
        ...this.buildChatPassthrough(wllamaOpts),
        ...sampling,
      } as never) as unknown as AsyncIterable<Record<string, unknown>>;

      let fullText = '';
      let lastFinishReason: FinishReason = 'stop';
      let lastUsage: Record<string, number> | undefined;

      for await (const chunk of stream) {
        if (abortSignal?.aborted) break;

        const choices = chunk.choices as Array<Record<string, unknown>> | undefined;
        const choice = choices?.[0];
        if (!choice) continue;

        const delta = choice.delta as Record<string, unknown> | undefined;
        const content = (delta?.content as string) || '';
        const reasoningContent = (delta?.reasoning_content as string) || '';
        const tokenText = content || reasoningContent;

        if (tokenText) {
          fullText += tokenText;
          yield { text: tokenText, done: false };
        }

        if (choice.finish_reason) {
          lastFinishReason = this.mapFinishReason(choice.finish_reason as string);
        }

        if (chunk.usage) {
          lastUsage = chunk.usage as Record<string, number>;
        }
      }

      yield {
        text: '',
        done: true,
        finishReason: lastFinishReason,
        usage: {
          inputTokens: lastUsage?.prompt_tokens ?? Math.ceil(prompt.length / 4),
          outputTokens: lastUsage?.completion_tokens ?? Math.ceil(fullText.length / 4),
          totalTokens: lastUsage?.total_tokens ?? 0,
          durationMs: Date.now() - startTime,
        },
      };
    } catch (error) {
      this.handleGenerationError(error);
    }
  }

  /**
   * Unload the model and free WASM memory.
   */
  async unload(): Promise<void> {
    if (this.wllamaInstance) {
      try { await this.wllamaInstance.exit(); } catch { /* ignore */ }
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
 */
export function createLanguageModel(
  modelId: string,
  settings?: WllamaModelSettings
): WllamaLanguageModel {
  return new WllamaLanguageModel(modelId, settings);
}
