/**
 * Chrome AI Translator Implementation
 *
 * Implements TranslationModel using Chrome's built-in Translator API.
 *
 * @packageDocumentation
 */

import type {
  TranslationModel,
  DoTranslateOptions,
  DoTranslateResult,
} from '@localmode/core';
import type { AITranslator, ChromeAITranslatorSettings } from '../types.js';
import { estimateTokens } from '../utils.js';

/**
 * Chrome AI Translator — implements TranslationModel.
 *
 * Uses Chrome's built-in Gemini Nano model for instant, zero-download translation.
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
      const ai = (self as any).ai;
      if (!ai?.translator) {
        throw new Error(
          'Chrome AI Translator API is not available. ' +
            'This requires Chrome 138+ with built-in AI enabled.'
        );
      }

      const session = await ai.translator.create({
        sourceLanguage,
        targetLanguage,
        signal: abortSignal,
      });

      this.sessions.set(key, session);
      return session;
    })();

    this.sessionPromises.set(key, promise);
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
