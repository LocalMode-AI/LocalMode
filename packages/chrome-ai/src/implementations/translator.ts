/**
 * Chrome AI Translator Implementation
 *
 * Implements TranslationModel using Chrome's built-in Translator API.
 *
 * @packageDocumentation
 */

import {
  TranslationError,
  type TranslationModel,
  type DoTranslateOptions,
  type DoTranslateResult,
} from '@localmode/core';
import type {
  AITranslator,
  AITranslatorCreateOptions,
  ChromeAIAvailabilityAtCreate,
  ChromeAIModelInfo,
  ChromeAIStreamChunk,
  ChromeAIStreamTranslateOptions,
  ChromeAITranslatorInfoOptions,
  ChromeAITranslatorSettings,
} from '../types.js';
import {
  availabilityWithDeadline,
  estimateTokens,
  getChromeBuildInfo,
  getTranslatorFactory,
  readTimedTextStream,
  toErrorCause,
} from '../utils.js';

function codedError(
  message: string,
  code: string,
  options: { hint?: string; cause?: Error; retryable: boolean },
): TranslationError {
  const err = new TranslationError(message, { hint: options.hint, cause: options.cause });
  (err as { code?: string }).code = code;
  (err as { retryable?: boolean }).retryable = options.retryable;
  return err;
}

/** Language pair argument shared by the quota and info methods */
interface PairOptions {
  sourceLanguage?: string;
  targetLanguage?: string;
  abortSignal?: AbortSignal;
}

/**
 * Chrome AI Translator — implements TranslationModel.
 *
 * Uses Chrome's built-in translation models. Your app ships no model files, but Chrome may
 * need to download a per-language-pair pack once — gate that with `allowDownload`.
 * Caches sessions per language pair for efficient reuse. Beyond `doTranslate()` it
 * streams via `doStreamTranslate()` and exposes `measureInputUsage()`,
 * `getInputQuota()` and `getModelInfo()` per pair.
 */
export class ChromeAITranslator implements TranslationModel {
  readonly modelId = 'chrome-ai:gemini-nano-translator';
  readonly provider = 'chrome-ai';

  private sessions = new Map<string, AITranslator>();
  private sessionPromises = new Map<string, Promise<AITranslator>>();
  private availabilityAtCreate = new Map<string, ChromeAIAvailabilityAtCreate>();
  private settings: ChromeAITranslatorSettings;

  constructor(settings: ChromeAITranslatorSettings = {}) {
    this.settings = settings;
  }

  /**
   * Get or create a translator session for a specific language pair.
   */
  private async getSession(
    sourceLanguage: string,
    targetLanguage: string,
    abortSignal?: AbortSignal
  ): Promise<AITranslator> {
    const key = `${sourceLanguage}-${targetLanguage}`;

    const cached = this.sessions.get(key);
    if (cached) return cached;

    const pending = this.sessionPromises.get(key);
    if (pending) return pending;

    const promise = (async () => {
      const factory = getTranslatorFactory();
      if (!factory) {
        throw new TranslationError(
          'Chrome AI Translator API is not available. `self.Translator` is undefined.',
          {
            hint: 'The Translator API requires Chrome 138+ stable on desktop. See https://localmode.dev/docs/chrome-ai for setup.',
          }
        );
      }

      // Availability is per language pair — each pack downloads separately. The
      // legacy `self.ai.translator` surface has no `availability()`.
      let availabilityAtCreate: ChromeAIAvailabilityAtCreate = 'not-checked';
      if (typeof factory.availability === 'function') {
        const availability = await availabilityWithDeadline(() =>
          factory.availability!({ sourceLanguage, targetLanguage }) as Promise<string>,
        );
        availabilityAtCreate = availability;
        // `Translator.availability()` has been observed never to settle on some
        // builds. A timeout falls through to create() rather than hanging here.
        if (availability === 'unavailable') {
          throw new TranslationError(
            `Chrome AI cannot translate ${sourceLanguage} to ${targetLanguage} on this device.`,
            { hint: 'Chrome reports this language pair as unavailable. Use a downloadable provider instead.' }
          );
        }
        if (
          (availability === 'downloadable' || availability === 'downloading') &&
          !this.settings.allowDownload
        ) {
          throw new TranslationError(
            `The ${sourceLanguage}\u2192${targetLanguage} language pack needs to be downloaded before use (status: ${availability}).`,
            {
              hint: 'Set `allowDownload: true` on the translator settings and call it from a user activation (click/tap/keypress) so Chrome can download the language pack.',
            }
          );
        }
      }

      const createOptions: AITranslatorCreateOptions = {
        sourceLanguage,
        targetLanguage,
        signal: abortSignal,
      };

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

      this.sessions.set(key, session);
      this.availabilityAtCreate.set(key, availabilityAtCreate);
      return session;
    })();

    this.sessionPromises.set(key, promise);
    // A failed create must not poison every later call for this pair.
    promise.catch(() => {
      this.sessionPromises.delete(key);
    });
    return promise;
  }

  async doTranslate(options: DoTranslateOptions): Promise<DoTranslateResult> {
    const { texts, abortSignal } = options;
    const sourceLanguage = options.sourceLanguage ?? this.settings.sourceLanguage ?? 'en';
    const targetLanguage = options.targetLanguage ?? this.settings.targetLanguage ?? 'es';

    abortSignal?.throwIfAborted();

    const session = await this.getSession(sourceLanguage, targetLanguage, abortSignal);

    abortSignal?.throwIfAborted();

    const startTime = performance.now();
    const translations: string[] = [];

    for (const text of texts) {
      abortSignal?.throwIfAborted();
      const translation = await session.translate(text, { signal: abortSignal });
      translations.push(translation);
    }

    const durationMs = performance.now() - startTime;
    const inputTokens = texts.reduce((sum, t) => sum + estimateTokens(t), 0);
    const outputTokens = translations.reduce((sum, t) => sum + estimateTokens(t), 0);

    return {
      translations,
      detectedLanguage: sourceLanguage,
      usage: {
        inputTokens,
        outputTokens,
        durationMs,
      },
    };
  }

  private resolvePair(options: { sourceLanguage?: string; targetLanguage?: string }): {
    sourceLanguage: string;
    targetLanguage: string;
  } {
    return {
      sourceLanguage: options.sourceLanguage ?? this.settings.sourceLanguage ?? 'en',
      targetLanguage: options.targetLanguage ?? this.settings.targetLanguage ?? 'es',
    };
  }

  /**
   * Stream one translation through Chrome's `translateStreaming()`.
   *
   * Yields each chunk exactly as Chrome delivers it, stamped with `performance.now()` on
   * arrival, then a final `{ done: true }` item carrying `timing` (request, first chunk,
   * end, chunk count, characters) and `usage`. `timing.requestedAt` is taken after the
   * pair's session exists, so first-chunk latency excludes session creation and any
   * language-pack download.
   *
   * @param options - Text, optional `sourceLanguage` / `targetLanguage`, `abortSignal`
   * @returns Async iterable of {@link ChromeAIStreamChunk}
   *
   * @throws {TranslationError} `chrome-ai-streaming-not-supported` when the session has
   *   no `translateStreaming()`; a stream failure wraps Chrome's error as `cause`.
   *   An abort surfaces as an `AbortError`.
   *
   * @example
   * ```ts
   * const model = chromeAI.translator({ sourceLanguage: 'en', targetLanguage: 'de' });
   * for await (const chunk of model.doStreamTranslate({ text: 'Good morning' })) {
   *   if (!chunk.done) output.append(chunk.text);
   * }
   * ```
   *
   * @see {@link ChromeAITranslator.doTranslate}
   */
  async *doStreamTranslate(options: ChromeAIStreamTranslateOptions): AsyncIterable<ChromeAIStreamChunk> {
    const { text, abortSignal } = options;
    const { sourceLanguage, targetLanguage } = this.resolvePair(options);

    abortSignal?.throwIfAborted();

    const session = await this.getSession(sourceLanguage, targetLanguage, abortSignal);
    abortSignal?.throwIfAborted();

    if (typeof session.translateStreaming !== 'function') {
      throw codedError(
        'This Chrome build does not expose translateStreaming() on the Translator.',
        'chrome-ai-streaming-not-supported',
        { hint: 'Use doTranslate(), or update to Chrome 138+ stable.', retryable: false },
      );
    }

    const requestedAt = performance.now();
    let firstChunkAt: number | null = null;
    let chunkCount = 0;
    let output = '';

    try {
      const stream = session.translateStreaming(text, abortSignal ? { signal: abortSignal } : undefined);
      for await (const chunk of readTimedTextStream(stream)) {
        if (firstChunkAt === null) firstChunkAt = chunk.timestamp;
        chunkCount++;
        output += chunk.text;
        yield { text: chunk.text, done: false, timestamp: chunk.timestamp };
        abortSignal?.throwIfAborted();
      }
    } catch (err) {
      if ((err as { name?: unknown } | null)?.name === 'AbortError') throw err;
      const cause = toErrorCause(err);
      throw codedError(
        `Chrome AI streaming translation failed: ${cause.name}: ${cause.message}`,
        'chrome-ai-translation-failed',
        { hint: 'Check the input against getInputQuota() / measureInputUsage().', cause, retryable: true },
      );
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
   * Measure how much of the pair session's `inputQuota` a text would use, via Chrome's
   * `measureInputUsage()`.
   *
   * @param text - Input to measure
   * @param options - Optional `sourceLanguage` / `targetLanguage` (default: settings) and `abortSignal`
   * @returns The usage Chrome reports
   * @throws {TranslationError} `chrome-ai-measure-not-supported` when Chrome does not expose it
   */
  async measureInputUsage(text: string, options: PairOptions = {}): Promise<number> {
    options.abortSignal?.throwIfAborted();
    const { sourceLanguage, targetLanguage } = this.resolvePair(options);
    const session = await this.getSession(sourceLanguage, targetLanguage, options.abortSignal);
    if (typeof session.measureInputUsage !== 'function') {
      throw codedError(
        'This Chrome build does not expose measureInputUsage() on the Translator.',
        'chrome-ai-measure-not-supported',
        { hint: 'Fall back to estimateTokens() or a character budget.', retryable: false },
      );
    }
    return session.measureInputUsage(text, options.abortSignal ? { signal: options.abortSignal } : undefined);
  }

  /**
   * The pair session's `inputQuota` (creating the session if needed), or `null` where
   * Chrome does not expose it.
   *
   * @param options - Optional `sourceLanguage` / `targetLanguage` and `abortSignal`
   * @returns The input quota or `null`
   */
  async getInputQuota(options: PairOptions = {}): Promise<number | null> {
    const { sourceLanguage, targetLanguage } = this.resolvePair(options);
    const session = await this.getSession(sourceLanguage, targetLanguage, options.abortSignal);
    return typeof session.inputQuota === 'number' ? session.inputQuota : null;
  }

  /**
   * Everything the page can record about the model behind one language pair: the
   * `availability()` state seen before `create()`, the pair passed to `create()` and as
   * the session reports it, `inputQuota`, and the Chrome build. Creates the session if
   * needed (so a `downloadable` pack needs `allowDownload` and a user activation).
   *
   * Chrome exposes no model or language-pack version to the page; `modelVersion` is
   * always `null`. Read it from `chrome://components` outside the page.
   *
   * @param options - Optional `sourceLanguage` / `targetLanguage` and `abortSignal`
   * @returns The model info
   *
   * @see {@link getChromeBuildInfo}
   */
  async getModelInfo(options: PairOptions = {}): Promise<ChromeAIModelInfo<ChromeAITranslatorInfoOptions>> {
    const { sourceLanguage, targetLanguage } = this.resolvePair(options);
    const session = await this.getSession(sourceLanguage, targetLanguage, options.abortSignal);
    const key = `${sourceLanguage}-${targetLanguage}`;
    return {
      api: 'Translator',
      modelId: this.modelId,
      availabilityAtCreate: this.availabilityAtCreate.get(key) ?? 'not-checked',
      requestedOptions: { sourceLanguage, targetLanguage },
      sessionOptions: {
        sourceLanguage: typeof session.sourceLanguage === 'string' ? session.sourceLanguage : null,
        targetLanguage: typeof session.targetLanguage === 'string' ? session.targetLanguage : null,
      },
      inputQuota: typeof session.inputQuota === 'number' ? session.inputQuota : null,
      modelVersion: null,
      browser: await getChromeBuildInfo(),
    };
  }

  /**
   * Destroy all cached sessions and free resources.
   */
  destroy(): void {
    for (const session of this.sessions.values()) {
      session.destroy();
    }
    this.sessions.clear();
    this.sessionPromises.clear();
    this.availabilityAtCreate.clear();
  }
}
