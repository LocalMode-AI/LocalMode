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
  ChromeAITranslatorSettings,
} from '../types.js';
import { availabilityWithDeadline, estimateTokens, getTranslatorFactory } from '../utils.js';

/**
 * Chrome AI Translator — implements TranslationModel.
 *
 * Uses Chrome's built-in translation models. Your app ships no model files, but Chrome may
 * need to download a per-language-pair pack once — gate that with `allowDownload`.
 * Caches sessions per language pair for efficient reuse.
 */
export class ChromeAITranslator implements TranslationModel {
  readonly modelId = 'chrome-ai:gemini-nano-translator';
  readonly provider = 'chrome-ai';

  private sessions = new Map<string, AITranslator>();
  private sessionPromises = new Map<string, Promise<AITranslator>>();
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
      if (typeof factory.availability === 'function') {
        const availability = await availabilityWithDeadline(() =>
          factory.availability!({ sourceLanguage, targetLanguage }) as Promise<string>,
        );
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

  /**
   * Destroy all cached sessions and free resources.
   */
  destroy(): void {
    for (const session of this.sessions.values()) {
      session.destroy();
    }
    this.sessions.clear();
    this.sessionPromises.clear();
  }
}
