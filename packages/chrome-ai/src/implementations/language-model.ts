/**
 * Chrome AI Language Model Implementation
 *
 * Implements LanguageModel using Chrome's built-in Prompt API
 * (`window.LanguageModel` / Gemini Nano).
 *
 * @packageDocumentation
 */

import {
  GenerationError,
  type ChatMessage,
  type ContentPart,
  type DoGenerateOptions,
  type DoGenerateResult,
  type DoStreamOptions,
  type FinishReason,
  type GenerationUsage,
  type LanguageModel,
  type StreamChunk,
} from '@localmode/core';
import type {
  AILanguageModel,
  AILanguageModelCreateOptions,
  AILanguageModelFactory,
  ChromeAILanguageModelSettings,
} from '../types.js';
import { estimateTokens } from '../utils.js';

/** Provider-options namespace recognised under `providerOptions.chromeAI` */
interface ChromeAIProviderOptions {
  topK?: number;
  allowDownload?: boolean;
  warnOnUnsupported?: boolean;
  monitor?: (m: EventTarget) => void;
}

/** Internal cache key payload used to dedupe sessions across calls */
interface SessionKeyPayload {
  systemPrompt?: string;
  messages?: { role: ChatMessage['role']; content: string }[];
  temperature?: number;
  topK?: number;
}

/**
 * Chrome AI Language Model — implements `LanguageModel` from `@localmode/core`.
 *
 * Wraps Chrome 138+ `window.LanguageModel` (Gemini Nano) to provide zero-download
 * text generation with `doGenerate()` and streaming `doStream()`. Supports the
 * model-warmup protocol via `warmUp()` / `isReady()`.
 *
 * Multimodal `ImagePart` content is rejected with `GenerationError`
 * (`code: 'chrome-ai-multimodal-not-supported'`) — Chrome's multimodal Prompt
 * input is behind an origin trial and out of scope for this implementation.
 *
 * @example Basic usage with `generateText()`
 * ```ts
 * import { generateText } from '@localmode/core';
 * import { chromeAI } from '@localmode/chrome-ai';
 *
 * const { text } = await generateText({
 *   model: chromeAI.languageModel({ systemPrompt: 'You are concise.' }),
 *   prompt: 'Explain quantum tunnelling.',
 * });
 * ```
 *
 * @example Streaming
 * ```ts
 * import { streamText } from '@localmode/core';
 * import { chromeAI } from '@localmode/chrome-ai';
 *
 * const { stream } = await streamText({
 *   model: chromeAI.languageModel(),
 *   prompt: 'Write a haiku about TypeScript.',
 * });
 * for await (const chunk of stream) {
 *   process.stdout.write(chunk.text);
 * }
 * ```
 *
 * @throws {GenerationError} with one of the following codes:
 *   - `chrome-ai-not-supported` — `window.LanguageModel` is missing entirely
 *   - `chrome-ai-model-not-available` — Gemini Nano is unavailable on this device
 *   - `chrome-ai-download-required` — model is downloadable but `allowDownload` was not set
 *   - `chrome-ai-permissions-denied` — user-gesture / origin requirement not met
 *   - `chrome-ai-multimodal-not-supported` — `ImagePart` was supplied
 *   - `chrome-ai-quota-exceeded` — input exceeded Gemini Nano's token budget
 */
export class ChromeAILanguageModel implements LanguageModel {
  readonly modelId = 'chrome-ai:gemini-nano';
  readonly provider = 'chrome-ai';
  readonly contextLength: number;
  readonly supportsVision = false;

  private session: AILanguageModel | null = null;
  private sessionPromise: Promise<AILanguageModel> | null = null;
  private sessionKey: string | null = null;
  private settings: ChromeAILanguageModelSettings;
  private hasWarnedTopP = false;

  /**
   * Construct a new Chrome AI language model.
   *
   * Construction is cheap — `window.LanguageModel.create()` is NOT called here. The
   * underlying Gemini Nano session is created lazily on the first `doGenerate()`,
   * `doStream()`, or `warmUp()` call.
   *
   * @param settings - Optional defaults for `systemPrompt`, `temperature`, `topK`,
   *   `contextLength`, and download `onProgress` callback.
   *
   * @example
   * ```ts
   * const model = new ChromeAILanguageModel({
   *   systemPrompt: 'You are a concise assistant.',
   *   temperature: 0.3,
   *   topK: 40,
   * });
   * ```
   */
  constructor(settings: ChromeAILanguageModelSettings = {}) {
    this.settings = settings;
    this.contextLength = settings.contextLength ?? 6144;
  }

  /**
   * Resolve the Chrome Prompt API factory across stable and legacy surfaces.
   * @internal
   */
  private getFactory(): AILanguageModelFactory | null {
    if (typeof self === 'undefined') return null;
    const top = (self as { LanguageModel?: AILanguageModelFactory }).LanguageModel;
    if (top) return top;
    const legacy = (self as any).ai?.languageModel as AILanguageModelFactory | undefined;
    return legacy ?? null;
  }

  /**
   * Build a stable cache key for the current session configuration.
   * @internal
   */
  private buildSessionKey(payload: SessionKeyPayload): string {
    return JSON.stringify(payload);
  }

  /**
   * Reject any messages containing non-text `ContentPart` entries. Chrome's
   * Prompt API does not yet accept multimodal input on the stable channel.
   * @internal
   */
  private assertNoImageParts(messages: ChatMessage[] | undefined): void {
    if (!messages || messages.length === 0) return;
    for (const msg of messages) {
      if (typeof msg.content === 'string') continue;
      for (const part of msg.content) {
        if (part.type !== 'text') {
          throw this.createError(
            'Chrome AI does not support multimodal Prompt input. Image content is not accepted by the stable Prompt API.',
            'chrome-ai-multimodal-not-supported',
            'Use @localmode/webllm with a vision model (e.g., Phi-3.5-vision-instruct) or @localmode/wllama with a vision GGUF for image input.',
          );
        }
      }
    }
  }

  /**
   * Flatten a possibly-multimodal `ContentPart[]` content into a single string.
   * Image parts must already be rejected via {@link assertNoImageParts}.
   * @internal
   */
  private flattenContent(content: string | ContentPart[]): string {
    if (typeof content === 'string') return content;
    return content
      .map((p) => (p.type === 'text' ? p.text : ''))
      .join('');
  }

  /**
   * Build `initialPrompts` from `systemPrompt` + history `messages` for
   * `LanguageModel.create()`.
   * @internal
   */
  private buildInitialPrompts(
    systemPrompt: string | undefined,
    messages: ChatMessage[] | undefined,
  ): AILanguageModelCreateOptions['initialPrompts'] {
    const out: NonNullable<AILanguageModelCreateOptions['initialPrompts']> = [];
    if (systemPrompt) {
      out.push({ role: 'system', content: systemPrompt });
    }
    if (messages && messages.length > 0) {
      for (const msg of messages) {
        out.push({ role: msg.role, content: this.flattenContent(msg.content) });
      }
    }
    return out.length > 0 ? out : undefined;
  }

  /**
   * Materialise a normalised payload for the session cache key.
   * Strips function references and reduces messages to plain `{ role, content: string }`.
   * @internal
   */
  private buildKeyPayload(
    systemPrompt: string | undefined,
    messages: ChatMessage[] | undefined,
    temperature: number | undefined,
    topK: number | undefined,
  ): SessionKeyPayload {
    return {
      systemPrompt,
      messages: messages?.map((m) => ({ role: m.role, content: this.flattenContent(m.content) })),
      temperature,
      topK,
    };
  }

  /**
   * Lazily create or reuse a `LanguageModelSession` matching the supplied
   * parameters. Concurrent calls share one in-flight `LanguageModel.create()`.
   *
   * On a settings change the previously-cached session is destroyed before a
   * new one is created — Chrome owns the underlying conversation history via
   * `initialPrompts`, so reusing a stale session with different history is unsafe.
   *
   * @internal
   */
  private async loadSession(args: {
    systemPrompt?: string;
    messages?: ChatMessage[];
    temperature?: number;
    topK?: number;
    abortSignal?: AbortSignal;
    allowDownload?: boolean;
    monitor?: (m: EventTarget) => void;
  }): Promise<AILanguageModel> {
    const keyPayload = this.buildKeyPayload(
      args.systemPrompt,
      args.messages,
      args.temperature,
      args.topK,
    );
    const key = this.buildSessionKey(keyPayload);

    // Reuse cached session when key matches.
    if (this.session && this.sessionKey === key) {
      return this.session;
    }

    // Reuse in-flight load when key matches.
    if (this.sessionPromise && this.sessionKey === key) {
      return this.sessionPromise;
    }

    // Settings changed (or no session yet) — destroy stale session.
    if (this.session) {
      try {
        this.session.destroy();
      } catch {
        // best-effort
      }
      this.session = null;
    }
    this.sessionPromise = null;
    this.sessionKey = key;

    const factory = this.getFactory();
    if (!factory) {
      throw this.createError(
        'Chrome AI Prompt API is not available. `window.LanguageModel` is undefined.',
        'chrome-ai-not-supported',
        'This requires Chrome 138+ stable on desktop with built-in AI enabled. See https://localmode.dev/docs/chrome-ai/language-model for setup.',
      );
    }

    const sessionPromise = (async () => {
      // Availability gate.
      try {
        const availability = await factory.availability();
        if (availability === 'unavailable' || (availability as string) === 'no') {
          throw this.createError(
            'Chrome AI Gemini Nano is reported as unavailable on this device.',
            'chrome-ai-model-not-available',
            'Enable on-device Gemini Nano via chrome://flags/#optimization-guide-on-device-model and chrome://flags/#prompt-api-for-gemini-nano, then restart Chrome. See https://localmode.dev/docs/chrome-ai for full setup.',
          );
        }
        if ((availability === 'downloadable' || availability === 'downloading') && !args.allowDownload) {
          throw this.createError(
            `Gemini Nano needs to be downloaded before use (status: ${availability}).`,
            'chrome-ai-download-required',
            'Pass `providerOptions: { chromeAI: { allowDownload: true } }` to opt in, or call `LanguageModel.create()` after a user gesture so Chrome can download the model.',
          );
        }
      } catch (err) {
        if (err instanceof GenerationError) throw err;
        // availability() can throw on some unsupported builds — treat as not-supported.
        throw this.createError(
          'Failed to query Chrome AI availability.',
          'chrome-ai-not-supported',
          'Update to Chrome 138+ stable with built-in AI enabled.',
          err as Error,
        );
      }

      const createOptions: AILanguageModelCreateOptions = {};
      const initialPrompts = this.buildInitialPrompts(args.systemPrompt, args.messages);
      if (initialPrompts) createOptions.initialPrompts = initialPrompts;
      if (args.temperature !== undefined) createOptions.temperature = args.temperature;
      if (args.topK !== undefined) createOptions.topK = args.topK;
      if (args.abortSignal) createOptions.signal = args.abortSignal;

      // Combine `monitor` callback (provider option) with `onProgress` (settings).
      const userMonitor = args.monitor;
      const onProgress = this.settings.onProgress;
      if (userMonitor || onProgress) {
        createOptions.monitor = (m: EventTarget) => {
          if (userMonitor) {
            try {
              userMonitor(m);
            } catch {
              // ignore monitor errors
            }
          }
          if (onProgress) {
            m.addEventListener('downloadprogress', ((evt: Event) => {
              const e = evt as Event & { loaded?: number; total?: number };
              onProgress({ loaded: e.loaded ?? 0, total: e.total ?? 0 });
            }) as EventListener);
          }
        };
      }

      let session: AILanguageModel;
      try {
        session = await factory.create(createOptions);
      } catch (err) {
        // Map Chrome create() errors.
        const e = err as Error;
        if (e?.name === 'NotAllowedError') {
          throw this.createError(
            'Chrome AI denied permission to create a Prompt API session.',
            'chrome-ai-permissions-denied',
            'Call `chromeAI.languageModel()` flows from a user-gesture handler (click, tap, key) and ensure the origin is allowed by your browser policy.',
            e,
          );
        }
        throw this.createError(
          `Chrome AI failed to create a Prompt API session: ${e?.message ?? String(e)}`,
          'chrome-ai-not-supported',
          'Verify Chrome 138+ stable, on-device model is enabled, and the page is not in Incognito mode.',
          e,
        );
      }

      // Guard against a settings-change race during an in-flight load.
      if (this.sessionKey === key) {
        this.session = session;
      } else {
        // Cache key drifted — drop this session.
        try {
          session.destroy();
        } catch {
          // ignore
        }
      }

      return session;
    })();

    this.sessionPromise = sessionPromise;
    try {
      const session = await sessionPromise;
      return session;
    } catch (err) {
      // On failure, clear the cached promise so the next call retries.
      if (this.sessionPromise === sessionPromise) {
        this.sessionPromise = null;
        this.sessionKey = null;
      }
      throw err;
    }
  }

  /**
   * Construct a `GenerationError` with a custom code and an actionable hint.
   * @internal
   */
  private createError(
    message: string,
    code: string,
    hint: string,
    cause?: Error,
  ): GenerationError {
    const err = new GenerationError(message, { hint, cause });
    (err as { code: string }).code = code;
    return err;
  }

  /**
   * Map an unknown error thrown by `session.prompt()` / `session.promptStreaming()`
   * to a `GenerationError` with the right `code`. AbortErrors are returned as-is
   * so callers can detect cancellation via the standard `error.name === 'AbortError'`.
   * @internal
   */
  private mapError(err: unknown): Error {
    if (err instanceof GenerationError) return err;
    const e = err as Error;
    const msg = e?.message ?? String(err);

    // Preserve aborts so callers can detect them via standard `AbortError`.
    if (e?.name === 'AbortError') {
      return e;
    }
    if (/quota|too long|input.*too|exceed/i.test(msg)) {
      return this.createError(
        `Chrome AI input exceeded Gemini Nano's token budget: ${msg}`,
        'chrome-ai-quota-exceeded',
        'Gemini Nano has a small context window (~6K tokens). Use @localmode/webllm with Llama-3.2-1B or larger for long-context generation.',
        e,
      );
    }
    if (e?.name === 'NotAllowedError') {
      return this.createError(
        'Chrome AI denied permission for the Prompt API call.',
        'chrome-ai-permissions-denied',
        'Trigger generation from a user-gesture handler (click, tap, or keypress) on a same-origin page.',
        e,
      );
    }
    return this.createError(
      `Chrome AI generation failed: ${msg}`,
      'chrome-ai-generation-failed',
      'Inspect `error.cause` for the underlying Chrome error. Consider falling back to @localmode/webllm or @localmode/wllama.',
      e,
    );
  }

  /**
   * Apply `stopSequences` to a generated text by truncating at the earliest
   * occurrence of any sequence. Returns the trimmed text and whether truncation
   * happened.
   * @internal
   */
  private applyStopSequences(text: string, stopSequences?: string[]): { text: string; stopped: boolean } {
    if (!stopSequences || stopSequences.length === 0) return { text, stopped: false };
    let earliest = -1;
    for (const stop of stopSequences) {
      if (!stop) continue;
      const idx = text.indexOf(stop);
      if (idx !== -1 && (earliest === -1 || idx < earliest)) {
        earliest = idx;
      }
    }
    if (earliest === -1) return { text, stopped: false };
    return { text: text.slice(0, earliest), stopped: true };
  }

  /**
   * Pre-flight invariants shared by `doGenerate()` and `doStream()`.
   * @internal
   */
  private parseInvariants(options: DoGenerateOptions | DoStreamOptions): {
    chromeOpts: ChromeAIProviderOptions;
    temperature: number | undefined;
    topK: number | undefined;
  } {
    if ('topP' in options && options.topP !== undefined) {
      const warnOnUnsupported =
        (options.providerOptions?.chromeAI as ChromeAIProviderOptions | undefined)?.warnOnUnsupported ?? true;
      if (warnOnUnsupported && !this.hasWarnedTopP) {
        this.hasWarnedTopP = true;
        // eslint-disable-next-line no-console
        console.warn(
          '[chrome-ai] `topP` is not supported by Chrome\'s Prompt API and will be ignored. Use `temperature` and `topK` instead. Set `providerOptions.chromeAI.warnOnUnsupported = false` to silence this warning.',
        );
      }
    }
    const chromeOpts = (options.providerOptions?.chromeAI as ChromeAIProviderOptions | undefined) ?? {};
    const temperature = options.temperature ?? this.settings.temperature;
    const topK = chromeOpts.topK ?? this.settings.topK;
    return { chromeOpts, temperature, topK };
  }

  /**
   * Generate a single completion using Chrome's Prompt API.
   *
   * @param options - Generation options. Supports `prompt`, `systemPrompt`,
   *   `messages`, `temperature`, `topK` (via `providerOptions.chromeAI`),
   *   `stopSequences` (post-processed client-side), `abortSignal`, and
   *   `providerOptions.chromeAI.{ allowDownload, monitor, warnOnUnsupported }`.
   * @returns `Promise<DoGenerateResult>` with `text`, `finishReason`, and `usage`
   *   (input/output/total tokens, durationMs).
   *
   * @throws {GenerationError} with `code` set to one of:
   *   `chrome-ai-not-supported`, `chrome-ai-model-not-available`,
   *   `chrome-ai-download-required`, `chrome-ai-permissions-denied`,
   *   `chrome-ai-multimodal-not-supported`, `chrome-ai-quota-exceeded`,
   *   `chrome-ai-aborted`, or `chrome-ai-generation-failed`.
   *
   * @example
   * ```ts
   * const result = await model.doGenerate({ prompt: 'Hello!' });
   * console.log(result.text, result.usage.durationMs);
   * ```
   */
  async doGenerate(options: DoGenerateOptions): Promise<DoGenerateResult> {
    const { prompt, systemPrompt, messages, stopSequences, abortSignal } = options;

    abortSignal?.throwIfAborted();
    this.assertNoImageParts(messages);

    const { chromeOpts, temperature, topK } = this.parseInvariants(options);

    const session = await this.loadSession({
      systemPrompt: systemPrompt ?? this.settings.systemPrompt,
      messages,
      temperature,
      topK,
      abortSignal,
      allowDownload: chromeOpts.allowDownload,
      monitor: chromeOpts.monitor,
    });

    abortSignal?.throwIfAborted();

    const inputUsageBefore = session.inputUsage ?? null;
    const startTime = performance.now();

    let rawText: string;
    try {
      rawText = await session.prompt(prompt, abortSignal ? { signal: abortSignal } : undefined);
    } catch (err) {
      throw this.mapError(err);
    }

    const durationMs = performance.now() - startTime;

    const { text } = this.applyStopSequences(rawText, stopSequences);
    // Chrome's Prompt API doesn't expose token-limit truncation — finishReason
    // is always 'stop' (either stop-sequence match or natural end-of-generation).
    const finishReason: FinishReason = 'stop';

    const inputUsageAfter = session.inputUsage ?? null;
    const inputTokens =
      inputUsageBefore !== null && inputUsageAfter !== null
        ? Math.max(0, inputUsageAfter - inputUsageBefore)
        : estimateTokens(prompt) + (systemPrompt ? estimateTokens(systemPrompt) : 0);
    const outputTokens = estimateTokens(text);

    const usage: GenerationUsage = {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      durationMs,
    };

    return { text, finishReason, usage };
  }

  /**
   * Stream a completion as an async iterable of `StreamChunk` deltas.
   *
   * Yields one `{ text, done: false }` chunk per delta from Chrome's
   * `ReadableStream<string>`, then a final `{ text: '', done: true, finishReason, usage }`
   * chunk with cumulative timing and token counts. If a stop sequence appears
   * in the accumulated text, iteration ends early with `finishReason: 'stop'`
   * and the stop sequence is excluded from the cumulative text.
   *
   * @param options - Same as {@link doGenerate}.
   * @returns Async iterable of `StreamChunk`.
   *
   * @throws {GenerationError} same codes as {@link doGenerate}, surfaced via the iteration.
   *
   * @example
   * ```ts
   * for await (const chunk of model.doStream({ prompt: 'Tell a joke' })) {
   *   if (!chunk.done) process.stdout.write(chunk.text);
   * }
   * ```
   */
  async *doStream(options: DoStreamOptions): AsyncIterable<StreamChunk> {
    const { prompt, systemPrompt, messages, stopSequences, abortSignal } = options;

    abortSignal?.throwIfAborted();
    this.assertNoImageParts(messages);

    const { chromeOpts, temperature, topK } = this.parseInvariants(options);

    const session = await this.loadSession({
      systemPrompt: systemPrompt ?? this.settings.systemPrompt,
      messages,
      temperature,
      topK,
      abortSignal,
      allowDownload: chromeOpts.allowDownload,
      monitor: chromeOpts.monitor,
    });

    abortSignal?.throwIfAborted();

    const startTime = performance.now();
    const inputUsageBefore = session.inputUsage ?? null;

    let stream: ReadableStream<string>;
    try {
      stream = session.promptStreaming(prompt, abortSignal ? { signal: abortSignal } : undefined);
    } catch (err) {
      throw this.mapError(err);
    }

    let accumulated = '';

    try {
      // Browser ReadableStreams are async-iterable in modern Chrome but the
      // TS DOM lib does not yet declare `Symbol.asyncIterator` on them.
      for await (const chunk of stream as unknown as AsyncIterable<string>) {
        abortSignal?.throwIfAborted();

        // Apply stop-sequence detection on the cumulative text. Compute the
        // delta to yield and check whether the new content tripped a stop seq.
        const next = accumulated + chunk;
        const { text: truncated, stopped } = this.applyStopSequences(next, stopSequences);

        const deltaText = truncated.slice(accumulated.length);
        accumulated = truncated;

        if (deltaText) {
          yield { text: deltaText, done: false };
        }

        if (stopped) {
          break;
        }
      }
    } catch (err) {
      throw this.mapError(err);
    }

    const durationMs = performance.now() - startTime;
    const inputUsageAfter = session.inputUsage ?? null;
    const inputTokens =
      inputUsageBefore !== null && inputUsageAfter !== null
        ? Math.max(0, inputUsageAfter - inputUsageBefore)
        : estimateTokens(prompt) + (systemPrompt ? estimateTokens(systemPrompt) : 0);
    const outputTokens = estimateTokens(accumulated);

    const finishReason: FinishReason = 'stop';
    const usage: GenerationUsage = {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      durationMs,
    };

    yield { text: '', done: true, finishReason, usage };
  }

  /**
   * Eagerly create the underlying Chrome `LanguageModelSession` with the
   * configured defaults so the next `doGenerate()` / `doStream()` call has
   * zero session-creation latency.
   *
   * Conforms to the model-warmup protocol — pairs with the `useModelWarmup()`
   * React hook from `@localmode/react`. Concurrent or repeat calls share a
   * single in-flight `LanguageModel.create()`.
   *
   * @returns Promise that resolves once the session is ready.
   *
   * @throws {GenerationError} same codes as {@link doGenerate} (without `chrome-ai-quota-exceeded`).
   *
   * @example
   * ```ts
   * await model.warmUp();
   * console.log(model.isReady()); // true
   * ```
   */
  async warmUp(): Promise<void> {
    await this.loadSession({
      systemPrompt: this.settings.systemPrompt,
      messages: undefined,
      temperature: this.settings.temperature,
      topK: this.settings.topK,
    });
  }

  /**
   * Synchronous readiness check.
   *
   * @returns `true` once a Chrome `LanguageModelSession` is cached on this
   *   instance; `false` otherwise.
   */
  isReady(): boolean {
    return this.session !== null;
  }

  /**
   * Destroy the cached session and release resources.
   *
   * Idempotent — safe to call multiple times. After `destroy()`, subsequent
   * `doGenerate()` / `doStream()` / `warmUp()` calls will recreate a fresh
   * session.
   *
   * @example
   * ```ts
   * model.destroy();
   * ```
   */
  destroy(): void {
    if (this.session) {
      try {
        this.session.destroy();
      } catch {
        // best-effort
      }
      this.session = null;
    }
    this.sessionPromise = null;
    this.sessionKey = null;
  }
}
