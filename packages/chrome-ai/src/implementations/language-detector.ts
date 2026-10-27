/**
 * Chrome AI Language Detector Implementation
 *
 * Implements LanguageDetectionModel using Chrome's built-in Language Detector API.
 *
 * @see https://developer.chrome.com/docs/ai/language-detection
 *
 * @packageDocumentation
 */

import {
  TranslationError,
  ValidationError,
  type DetectedLanguage,
  type DoDetectLanguageOptions,
  type DoDetectLanguageResult,
  type LanguageDetectionModel,
} from '@localmode/core';
import type {
  AILanguageDetector,
  AILanguageDetectorCreateOptions,
  ChromeAILanguageDetectorSettings,
} from '../types.js';
import { availabilityWithDeadline, getLanguageDetectorFactory } from '../utils.js';

/** BCP 47 tag Chrome uses for the undetermined remainder of a detection. */
const UNDETERMINED_LANGUAGE = 'und';

/**
 * Codes a retry cannot fix: the API or model is missing, the download needs a fresh
 * user activation, or the same input would exceed the quota again. Errors with these
 * codes carry `retryable: false`, so `detectLanguage()` rethrows them at once.
 */
const NON_RETRYABLE_CODES: ReadonlySet<string> = new Set([
  'chrome-ai-not-supported',
  'chrome-ai-model-not-available',
  'chrome-ai-download-required',
  'chrome-ai-permissions-denied',
  'chrome-ai-quota-exceeded',
]);

/** Per-call options read from `providerOptions.chromeAI`. */
interface ChromeAILanguageDetectorCallOptions {
  allowDownload?: boolean;
  topK?: number;
}

/**
 * Chrome AI Language Detector — implements `LanguageDetectionModel`.
 *
 * Wraps Chrome's built-in `LanguageDetector` global (Chrome 138+ on desktop, window
 * contexts only). Your app ships no model files, but Chrome may need to download the
 * detection model once (browser-wide) — opt in with `allowDownload`, from a user
 * activation.
 *
 * Construction is lazy and never throws, even on a browser without the API: gate with
 * the synchronous `isLanguageDetectorSupported()`. Errors are `TranslationError`s with
 * a `code`:
 *   - `chrome-ai-not-supported` — `self.LanguageDetector` is missing, or Chrome failed
 *     to create a session
 *   - `chrome-ai-model-not-available` — `availability()` reports `unavailable`
 *   - `chrome-ai-download-required` — the model is `downloadable`/`downloading` and
 *     `allowDownload` was not set
 *   - `chrome-ai-permissions-denied` — Chrome refused without a user activation
 *   - `chrome-ai-quota-exceeded` — the input exceeds the session's `inputQuota`
 *   - `chrome-ai-detection-failed` — any other `detect()` failure (see `cause`)
 *
 * Every code except `chrome-ai-detection-failed` sets `retryable: false`, so core's
 * `detectLanguage()` fails at once instead of retrying with backoff (a retry would
 * also run after the user activation that allows a download has expired).
 *
 * Aborts surface as the original `AbortError`.
 *
 * Results map Chrome's `{ detectedLanguage, confidence }[]` to core's
 * `{ languageCode, confidence }[]`, highest confidence first. `languageCode` is the
 * BCP 47 tag Chrome returns (a bare ISO 639-1 code for most languages). Chrome's
 * `'und'` (undetermined) entry is dropped. Chrome notes that very short phrases and
 * single words give low-accuracy results.
 *
 * @see https://developer.chrome.com/docs/ai/language-detection
 *
 * @example
 * ```ts
 * import { detectLanguage } from '@localmode/core';
 * import { chromeAI, isLanguageDetectorSupported } from '@localmode/chrome-ai';
 *
 * if (isLanguageDetectorSupported()) {
 *   const { languages } = await detectLanguage({
 *     model: chromeAI.languageDetector(),
 *     text: 'Hallo und herzlich willkommen!',
 *   });
 *   console.log(languages[0]); // { languageCode: 'de', confidence: 0.99… }
 * }
 * ```
 */
export class ChromeAILanguageDetector implements LanguageDetectionModel {
  readonly modelId = 'chrome-ai:language-detector';
  readonly provider = 'chrome-ai';

  private session: AILanguageDetector | null = null;
  private sessionPromise: Promise<AILanguageDetector> | null = null;
  private settings: ChromeAILanguageDetectorSettings;

  constructor(settings: ChromeAILanguageDetectorSettings = {}) {
    this.settings = settings;
  }

  /**
   * Get or create the detector session. Concurrent calls share one in-flight
   * `LanguageDetector.create()`; a failed create is not cached.
   */
  private async getSession(args: {
    abortSignal?: AbortSignal;
    allowDownload?: boolean;
  }): Promise<AILanguageDetector> {
    if (this.session) return this.session;
    if (this.sessionPromise) return this.sessionPromise;

    const factory = getLanguageDetectorFactory();
    if (!factory) {
      throw this.createError(
        'Chrome AI Language Detector API is not available. `self.LanguageDetector` is undefined.',
        'chrome-ai-not-supported',
        'The Language Detector API requires Chrome 138+ on desktop, in a window (not a Web Worker). See https://localmode.dev/docs/chrome-ai for setup, or use @localmode/mediapipe as a fallback.'
      );
    }

    const expectedInputLanguages = this.settings.expectedInputLanguages;

    const promise = (async () => {
      // The legacy `self.ai.languageDetector` surface has no `availability()`;
      // there, presence is all we can check.
      if (typeof factory.availability === 'function') {
        let availability: Awaited<ReturnType<typeof availabilityWithDeadline>>;
        try {
          availability = await availabilityWithDeadline(
            () =>
              factory.availability!(
                expectedInputLanguages ? { expectedInputLanguages } : undefined
              ) as Promise<string>
          );
        } catch (err) {
          throw this.createError(
            'Failed to query Chrome AI Language Detector availability.',
            'chrome-ai-not-supported',
            'Update to Chrome 138+ on desktop, where the Language Detector API ships for web pages.',
            err as Error
          );
        }
        // A probe that never answers must not wedge the caller; a timeout falls
        // through to create(), which surfaces a real error instead of hanging.
        if (availability === 'unavailable') {
          throw this.createError(
            'Chrome AI Language Detector is reported as unavailable on this device.',
            'chrome-ai-model-not-available',
            expectedInputLanguages
              ? `This device or Chrome build cannot detect the expected input languages (${expectedInputLanguages.join(', ')}). Drop \`expectedInputLanguages\` or use @localmode/mediapipe instead.`
              : 'This device or Chrome build cannot run the on-device language detection model. Use @localmode/mediapipe instead.'
          );
        }
        if (
          (availability === 'downloadable' || availability === 'downloading') &&
          !args.allowDownload
        ) {
          throw this.createError(
            `The Chrome AI language detection model needs to be downloaded before use (status: ${availability}).`,
            'chrome-ai-download-required',
            'Pass `allowDownload: true` on the languageDetector settings (or `providerOptions: { chromeAI: { allowDownload: true } }`) and call it from a user activation (click/tap/keypress) so Chrome can download the model.'
          );
        }
      }

      const createOptions: AILanguageDetectorCreateOptions = {};
      if (expectedInputLanguages) createOptions.expectedInputLanguages = expectedInputLanguages;
      if (args.abortSignal) createOptions.signal = args.abortSignal;

      const onProgress = this.settings.onProgress;
      if (onProgress) {
        createOptions.monitor = (m: EventTarget) => {
          m.addEventListener('downloadprogress', ((evt: Event) => {
            const e = evt as Event & { loaded?: number; total?: number };
            onProgress({ loaded: e.loaded ?? 0, total: e.total ?? 0 });
          }) as EventListener);
        };
      }

      let session: AILanguageDetector;
      try {
        session = await factory.create(createOptions);
      } catch (err) {
        const e = err as Error;
        if (e?.name === 'AbortError') throw e;
        if (e?.name === 'NotAllowedError') {
          throw this.createError(
            'Chrome AI denied permission to create a Language Detector session.',
            'chrome-ai-permissions-denied',
            'Call it from a user-activation handler (click, tap, or keypress) when the model still has to download, on a top-level or same-origin page (cross-origin iframes need `allow="language-detector"`).',
            e
          );
        }
        throw this.createError(
          `Chrome AI failed to create a Language Detector session: ${e?.message ?? String(e)}`,
          'chrome-ai-not-supported',
          'Verify Chrome 138+ on desktop and that the page is not in Incognito mode.',
          e
        );
      }

      this.session = session;
      return session;
    })();

    this.sessionPromise = promise;
    // A failed create must not poison every later call with the same rejection.
    promise.catch(() => {
      if (this.sessionPromise === promise) this.sessionPromise = null;
    });
    return promise;
  }

  /**
   * Detect the language of `options.text`.
   *
   * @param options - Text, AbortSignal, and `providerOptions.chromeAI.{ allowDownload, topK }`
   * @returns Detected languages, highest confidence first, plus usage
   * @throws {TranslationError} with one of the codes listed on the class
   * @throws {ValidationError} if `topK` is not a positive integer
   */
  async doDetect(options: DoDetectLanguageOptions): Promise<DoDetectLanguageResult> {
    const { text, abortSignal, providerOptions } = options;

    abortSignal?.throwIfAborted();

    const callOptions = (providerOptions?.chromeAI ?? {}) as ChromeAILanguageDetectorCallOptions;
    const topK = callOptions.topK ?? this.settings.topK;
    if (topK !== undefined && (!Number.isInteger(topK) || topK < 1)) {
      throw new ValidationError(
        `Invalid topK for the Chrome AI language detector: ${String(topK)}.`,
        'Pass a positive integer, or omit topK to keep every candidate.'
      );
    }

    const session = await this.getSession({
      abortSignal,
      allowDownload: callOptions.allowDownload ?? this.settings.allowDownload,
    });

    abortSignal?.throwIfAborted();

    const startTime = performance.now();

    let raw: Awaited<ReturnType<AILanguageDetector['detect']>>;
    try {
      raw = await session.detect(text, abortSignal ? { signal: abortSignal } : undefined);
    } catch (err) {
      throw this.mapDetectError(err);
    }

    const languages: DetectedLanguage[] = raw
      .filter((r) => r.detectedLanguage !== UNDETERMINED_LANGUAGE)
      .map((r) => ({ languageCode: r.detectedLanguage, confidence: r.confidence }))
      .sort((a, b) => b.confidence - a.confidence);

    return {
      languages: topK === undefined ? languages : languages.slice(0, topK),
      usage: { durationMs: performance.now() - startTime },
    };
  }

  /**
   * Create the Chrome session ahead of the first `doDetect()` so it has no creation
   * latency. Accepts the same `allowDownload` opt-in as the settings.
   *
   * @throws {TranslationError} with the load codes listed on the class
   */
  async warmUp(options: { allowDownload?: boolean; abortSignal?: AbortSignal } = {}): Promise<void> {
    await this.getSession({
      abortSignal: options.abortSignal,
      allowDownload: options.allowDownload ?? this.settings.allowDownload,
    });
  }

  /** `true` once a Chrome session is cached on this instance. */
  isReady(): boolean {
    return this.session !== null;
  }

  /**
   * Destroy the session and free resources. Idempotent; the next call creates a
   * fresh session.
   */
  destroy(): void {
    const session = this.session;
    this.session = null;
    this.sessionPromise = null;
    if (session) {
      try {
        session.destroy();
      } catch {
        // best-effort
      }
    }
  }

  /**
   * Map an error thrown by `session.detect()` to a coded `TranslationError`.
   * AbortErrors are returned as-is so callers can detect cancellation.
   * @internal
   */
  private mapDetectError(err: unknown): Error {
    const e = err as Error;
    const msg = e?.message ?? String(err);
    if (e?.name === 'AbortError') return e;
    if (e?.name === 'QuotaExceededError' || /quota/i.test(msg)) {
      return this.createError(
        `Input exceeds the Chrome AI Language Detector's input quota: ${msg}`,
        'chrome-ai-quota-exceeded',
        "Detect on a shorter excerpt (a few sentences identify a language reliably); the session's `inputQuota` is the limit.",
        e
      );
    }
    if (e?.name === 'NotAllowedError') {
      return this.createError(
        'Chrome AI denied permission for the Language Detector call.',
        'chrome-ai-permissions-denied',
        'Call it from a top-level or same-origin page (cross-origin iframes need `allow="language-detector"`).',
        e
      );
    }
    return this.createError(
      `Chrome AI language detection failed: ${msg}`,
      'chrome-ai-detection-failed',
      'Inspect `error.cause` for the underlying Chrome error, or fall back to @localmode/mediapipe.',
      e
    );
  }

  /**
   * Construct a `TranslationError` with a custom code, an actionable hint and a
   * `retryable` flag (`false` for the codes in `NON_RETRYABLE_CODES`).
   * @internal
   */
  private createError(
    message: string,
    code: string,
    hint: string,
    cause?: Error
  ): TranslationError {
    const err = new TranslationError(message, { hint, cause });
    (err as { code: string }).code = code;
    (err as { retryable?: boolean }).retryable = !NON_RETRYABLE_CODES.has(code);
    return err;
  }
}
