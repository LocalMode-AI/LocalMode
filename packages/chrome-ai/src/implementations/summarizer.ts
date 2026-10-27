/**
 * Chrome AI Summarizer Implementation
 *
 * Implements SummarizationModel using Chrome's built-in Summarizer API.
 *
 * @packageDocumentation
 */

import {
  SummarizationError,
  type SummarizationModel,
  type DoSummarizeOptions,
  type DoSummarizeResult,
} from '@localmode/core';
import type {
  AISummarizer,
  AISummarizerCreateOptions,
  ChromeAIAvailabilityAtCreate,
  ChromeAIModelInfo,
  ChromeAIStreamChunk,
  ChromeAIStreamSummarizeOptions,
  ChromeAISummarizerInfoOptions,
  ChromeAISummarizerSettings,
} from '../types.js';
import {
  availabilityWithDeadline,
  estimateTokens,
  getChromeBuildInfo,
  getSummarizerFactory,
  readTimedTextStream,
  toErrorCause,
} from '../utils.js';

function codedError(
  message: string,
  code: string,
  options: { hint?: string; cause?: Error; retryable: boolean },
): SummarizationError {
  const err = new SummarizationError(message, { hint: options.hint, cause: options.cause });
  (err as { code?: string }).code = code;
  (err as { retryable?: boolean }).retryable = options.retryable;
  return err;
}

function isAbortError(err: unknown): boolean {
  return (err as { name?: unknown } | null)?.name === 'AbortError';
}

/**
 * Chrome AI Summarizer — implements SummarizationModel.
 *
 * Uses Chrome's built-in on-device model. Your app ships no model files, but Chrome may
 * need to download the model once (browser-wide) — gate that with `allowDownload`.
 * Beyond `doSummarize()` it streams via `doStreamSummarize()` and exposes
 * `measureInputUsage()`, `getInputQuota()` and `getModelInfo()`.
 */
export class ChromeAISummarizer implements SummarizationModel {
  readonly modelId = 'chrome-ai:gemini-nano-summarizer';
  readonly provider = 'chrome-ai';

  private session: AISummarizer | null = null;
  private sessionPromise: Promise<AISummarizer> | null = null;
  private settings: ChromeAISummarizerSettings;
  private availabilityAtCreate: ChromeAIAvailabilityAtCreate = 'not-checked';
  private requestedOptions: ChromeAISummarizerInfoOptions | null = null;

  constructor(settings: ChromeAISummarizerSettings = {}) {
    this.settings = settings;
  }

  /**
   * Get or create the summarizer session.
   */
  private async getSession(abortSignal?: AbortSignal): Promise<AISummarizer> {
    if (this.session) return this.session;
    if (this.sessionPromise) return this.sessionPromise;

    this.sessionPromise = (async () => {
      const factory = getSummarizerFactory();
      if (!factory) {
        throw new SummarizationError(
          'Chrome AI Summarizer API is not available. `self.Summarizer` is undefined.',
          {
            hint: 'The Summarizer API requires Chrome 138+ stable on desktop. See https://localmode.dev/docs/chrome-ai for setup.',
          }
        );
      }

      const createOptions: AISummarizerCreateOptions = {
        type: this.settings.type ?? 'tldr',
        format: this.settings.format ?? 'plain-text',
        length: this.settings.length ?? 'medium',
        sharedContext: this.settings.sharedContext,
        signal: abortSignal,
      };
      // Language options go to availability() and create() only when set, so an unset
      // value keeps Chrome's own default.
      if (this.settings.expectedInputLanguages !== undefined) {
        createOptions.expectedInputLanguages = [...this.settings.expectedInputLanguages];
      }
      if (this.settings.expectedContextLanguages !== undefined) {
        createOptions.expectedContextLanguages = [...this.settings.expectedContextLanguages];
      }
      if (this.settings.outputLanguage !== undefined) {
        createOptions.outputLanguage = this.settings.outputLanguage;
      }

      // Availability gate. The legacy `self.ai.summarizer` surface has no
      // `availability()`; there, presence is all we can check.
      let availabilityAtCreate: ChromeAIAvailabilityAtCreate = 'not-checked';
      if (typeof factory.availability === 'function') {
        const availability = await availabilityWithDeadline(() =>
          factory.availability!(createOptions) as Promise<string>,
        );
        availabilityAtCreate = availability;
        // A probe that never answers must not wedge the caller; fall through to
        // create(), which surfaces a real error instead of hanging on the gate.
        if (availability === 'unavailable') {
          throw new SummarizationError(
            'Chrome AI Summarizer is reported as unavailable on this device.',
            { hint: 'This device or Chrome build cannot run the on-device summarization model.' }
          );
        }
        if (
          (availability === 'downloadable' || availability === 'downloading') &&
          !this.settings.allowDownload
        ) {
          throw new SummarizationError(
            `The Chrome AI summarization model needs to be downloaded before use (status: ${availability}).`,
            {
              hint: 'Set `allowDownload: true` on the summarizer settings and call it from a user activation (click/tap/keypress) so Chrome can download the model.',
            }
          );
        }
      }

      const onProgress = this.settings.onProgress;
      if (onProgress) {
        createOptions.monitor = (m: EventTarget) => {
          m.addEventListener('downloadprogress', ((evt: Event) => {
            const e = evt as Event & { loaded?: number; total?: number };
            onProgress({ loaded: e.loaded ?? 0, total: e.total ?? 0 });
          }) as EventListener);
        };
      }

      const session = await factory.create(createOptions);

      this.session = session;
      this.availabilityAtCreate = availabilityAtCreate;
      this.requestedOptions = {
        type: createOptions.type!,
        format: createOptions.format!,
        length: createOptions.length!,
        sharedContext: createOptions.sharedContext,
        expectedInputLanguages: createOptions.expectedInputLanguages,
        expectedContextLanguages: createOptions.expectedContextLanguages,
        outputLanguage: createOptions.outputLanguage,
      };
      return session;
    })();

    // A failed create must not poison every later call with the same rejection.
    this.sessionPromise.catch(() => {
      this.sessionPromise = null;
    });

    return this.sessionPromise;
  }

  /**
   * Map numeric maxLength to Chrome AI's length enum.
   */
  private mapLength(maxLength?: number): 'short' | 'medium' | 'long' | undefined {
    if (maxLength === undefined) return undefined;
    if (maxLength <= 50) return 'short';
    if (maxLength <= 150) return 'medium';
    return 'long';
  }

  /**
   * Apply per-call `providerOptions.chromeAI` and `maxLength`, destroying the session
   * when they change its creation options.
   */
  private applyCallOptions(
    maxLength: number | undefined,
    providerOptions: Record<string, Record<string, unknown>> | undefined,
  ): void {
    // Apply provider-specific options if provided
    const chromeOptions = providerOptions?.chromeAI as ChromeAISummarizerSettings | undefined;
    if (chromeOptions) {
      // Recreate the session only when a creation option actually changes.
      const keys = [
        'type',
        'format',
        'length',
        'sharedContext',
        'outputLanguage',
        'expectedInputLanguages',
        'expectedContextLanguages',
      ] as const;
      const changed = keys.some(
        (key) =>
          chromeOptions[key] !== undefined &&
          JSON.stringify(chromeOptions[key]) !== JSON.stringify(this.settings[key]),
      );
      if (changed) this.destroy();
      this.settings = { ...this.settings, ...chromeOptions };
    }

    // Map maxLength to Chrome AI length if not already set via provider options
    const lengthFromMaxLength = this.mapLength(maxLength);
    if (lengthFromMaxLength && !chromeOptions?.length) {
      const currentLength = this.settings.length ?? 'medium';
      if (lengthFromMaxLength !== currentLength) {
        this.destroy();
        this.settings = { ...this.settings, length: lengthFromMaxLength };
      }
    }
  }

  async doSummarize(options: DoSummarizeOptions): Promise<DoSummarizeResult> {
    const { texts, abortSignal, providerOptions } = options;

    abortSignal?.throwIfAborted();

    this.applyCallOptions(options.maxLength, providerOptions);

    const session = await this.getSession(abortSignal);

    abortSignal?.throwIfAborted();

    const startTime = performance.now();
    const summaries: string[] = [];

    for (const text of texts) {
      abortSignal?.throwIfAborted();
      const summary = await session.summarize(text, { signal: abortSignal });
      summaries.push(summary);
    }

    const durationMs = performance.now() - startTime;
    const inputTokens = texts.reduce((sum, t) => sum + estimateTokens(t), 0);
    const outputTokens = summaries.reduce((sum, s) => sum + estimateTokens(s), 0);

    return {
      summaries,
      usage: {
        inputTokens,
        outputTokens,
        durationMs,
      },
    };
  }

  /**
   * Stream one summary through Chrome's `summarizeStreaming()`.
   *
   * Yields each chunk exactly as Chrome delivers it, stamped with `performance.now()` on
   * arrival, then a final `{ done: true }` item carrying `timing` (request, first chunk,
   * end, chunk count, characters) and `usage`. `timing.requestedAt` is taken after the
   * session exists, so first-chunk latency excludes session creation and any download.
   *
   * @param options - Text, optional per-call `context`, `maxLength`, `abortSignal`, `providerOptions`
   * @returns Async iterable of {@link ChromeAIStreamChunk}
   *
   * @throws {SummarizationError} `chrome-ai-streaming-not-supported` when the session has
   *   no `summarizeStreaming()`; a stream failure wraps Chrome's error as `cause`.
   *   An abort surfaces as an `AbortError`.
   *
   * @example
   * ```ts
   * const model = chromeAI.summarizer({ type: 'tldr' });
   * for await (const chunk of model.doStreamSummarize({ text: article })) {
   *   if (!chunk.done) output.append(chunk.text);
   *   else console.log(chunk.timing!.firstChunkAt! - chunk.timing!.requestedAt);
   * }
   * ```
   *
   * @see {@link ChromeAISummarizer.doSummarize}
   */
  async *doStreamSummarize(options: ChromeAIStreamSummarizeOptions): AsyncIterable<ChromeAIStreamChunk> {
    const { text, context, abortSignal, providerOptions } = options;

    abortSignal?.throwIfAborted();
    this.applyCallOptions(options.maxLength, providerOptions);

    const session = await this.getSession(abortSignal);
    abortSignal?.throwIfAborted();

    if (typeof session.summarizeStreaming !== 'function') {
      throw codedError(
        'This Chrome build does not expose summarizeStreaming() on the Summarizer.',
        'chrome-ai-streaming-not-supported',
        { hint: 'Use doSummarize(), or update to Chrome 138+ stable.', retryable: false },
      );
    }

    const callOptions: { signal?: AbortSignal; context?: string } = {};
    if (abortSignal) callOptions.signal = abortSignal;
    if (context !== undefined) callOptions.context = context;

    const requestedAt = performance.now();
    let firstChunkAt: number | null = null;
    let chunkCount = 0;
    let output = '';

    try {
      const stream = session.summarizeStreaming(text, callOptions);
      for await (const chunk of readTimedTextStream(stream)) {
        if (firstChunkAt === null) firstChunkAt = chunk.timestamp;
        chunkCount++;
        output += chunk.text;
        yield { text: chunk.text, done: false, timestamp: chunk.timestamp };
        abortSignal?.throwIfAborted();
      }
    } catch (err) {
      if (isAbortError(err)) throw err;
      const cause = toErrorCause(err);
      throw codedError(`Chrome AI streaming summarization failed: ${cause.name}: ${cause.message}`, 'chrome-ai-summarization-failed', {
        hint: 'Check the input against getInputQuota() / measureInputUsage().',
        cause,
        retryable: true,
      });
    }

    const endedAt = performance.now();
    yield {
      text: '',
      done: true,
      timestamp: endedAt,
      timing: { requestedAt, firstChunkAt, endedAt, chunkCount, chars: output.length },
      usage: {
        inputTokens: estimateTokens(text),
        outputTokens: estimateTokens(output),
        durationMs: endedAt - requestedAt,
      },
    };
  }

  /**
   * Measure how much of the session's `inputQuota` a text (plus optional per-call
   * `context`) would use, via Chrome's `measureInputUsage()`.
   *
   * @param text - Input to measure
   * @param options - Optional per-call `context` and `abortSignal`
   * @returns The usage Chrome reports
   * @throws {SummarizationError} `chrome-ai-measure-not-supported` when Chrome does not expose it
   *
   * @example
   * ```ts
   * const usage = await model.measureInputUsage(article);
   * if (usage > (await model.getInputQuota())!) { ... }
   * ```
   */
  async measureInputUsage(
    text: string,
    options: { context?: string; abortSignal?: AbortSignal } = {},
  ): Promise<number> {
    options.abortSignal?.throwIfAborted();
    const session = await this.getSession(options.abortSignal);
    if (typeof session.measureInputUsage !== 'function') {
      throw codedError(
        'This Chrome build does not expose measureInputUsage() on the Summarizer.',
        'chrome-ai-measure-not-supported',
        { hint: 'Fall back to estimateTokens() or a character budget.', retryable: false },
      );
    }
    const callOptions: { signal?: AbortSignal; context?: string } = {};
    if (options.abortSignal) callOptions.signal = options.abortSignal;
    if (options.context !== undefined) callOptions.context = options.context;
    return session.measureInputUsage(text, callOptions);
  }

  /**
   * The session's `inputQuota` (creating the session if needed), or `null` where Chrome
   * does not expose it.
   *
   * @param options - Optional `abortSignal` for session creation
   * @returns The input quota or `null`
   */
  async getInputQuota(options: { abortSignal?: AbortSignal } = {}): Promise<number | null> {
    const session = await this.getSession(options.abortSignal);
    return typeof session.inputQuota === 'number' ? session.inputQuota : null;
  }

  /**
   * Everything the page can record about the model behind this summarizer: the
   * `availability()` state seen before `create()`, the options passed to `create()` and
   * as the session reports them, `inputQuota`, and the Chrome build. Creates the session
   * if needed (so a `downloadable` model needs `allowDownload` and a user activation).
   *
   * Chrome exposes no model version to the page; `modelVersion` is always `null`. Read
   * the on-device model version from `chrome://components` outside the page.
   *
   * @param options - Optional `abortSignal` for session creation
   * @returns The model info
   *
   * @see {@link getChromeBuildInfo}
   */
  async getModelInfo(
    options: { abortSignal?: AbortSignal } = {},
  ): Promise<ChromeAIModelInfo<ChromeAISummarizerInfoOptions>> {
    const session = await this.getSession(options.abortSignal);
    const requested = this.requestedOptions!;
    const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
    const langs = (v: unknown): string[] | null =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null;
    return {
      api: 'Summarizer',
      modelId: this.modelId,
      availabilityAtCreate: this.availabilityAtCreate,
      requestedOptions: {
        ...requested,
        expectedInputLanguages: requested.expectedInputLanguages && [...requested.expectedInputLanguages],
        expectedContextLanguages: requested.expectedContextLanguages && [
          ...requested.expectedContextLanguages,
        ],
      },
      sessionOptions: {
        type: str(session.type),
        format: str(session.format),
        length: str(session.length),
        sharedContext: str(session.sharedContext),
        expectedInputLanguages: langs(session.expectedInputLanguages),
        expectedContextLanguages: langs(session.expectedContextLanguages),
        outputLanguage: str(session.outputLanguage),
      },
      inputQuota: typeof session.inputQuota === 'number' ? session.inputQuota : null,
      modelVersion: null,
      browser: await getChromeBuildInfo(),
    };
  }

  /**
   * Destroy the session and free resources.
   */
  destroy(): void {
    if (this.session) {
      this.session.destroy();
      this.session = null;
      this.sessionPromise = null;
    }
  }
}
