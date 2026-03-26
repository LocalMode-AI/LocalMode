/**
 * Chrome AI Provider
 *
 * Factory for creating Chrome AI model instances.
 *
 * @packageDocumentation
 */

import type { SummarizationModel, TranslationModel } from '@localmode/core';
import type {
  ChromeAIProvider,
  ChromeAIProviderSettings,
  ChromeAISummarizerSettings,
  ChromeAITranslatorSettings,
} from './types.js';
import { ChromeAISummarizer } from './implementations/summarizer.js';
import { ChromeAITranslator } from './implementations/translator.js';

/**
 * Create a Chrome AI provider.
 *
 * @param settings - Optional provider-level settings
 * @returns Chrome AI provider with summarizer() and translator() factory methods
 *
 * @example
 * ```ts
 * import { createChromeAI } from '@localmode/chrome-ai';
 *
 * const provider = createChromeAI();
 * const summarizer = provider.summarizer({ type: 'key-points' });
 * const translator = provider.translator({ targetLanguage: 'de' });
 * ```
 */
export function createChromeAI(_settings?: ChromeAIProviderSettings): ChromeAIProvider {
  return {
    summarizer(settings?: ChromeAISummarizerSettings): SummarizationModel {
      return new ChromeAISummarizer(settings);
    },

    translator(settings?: ChromeAITranslatorSettings): TranslationModel {
      return new ChromeAITranslator(settings);
    },
  };
}

/** Default Chrome AI provider instance */
export const chromeAI: ChromeAIProvider = createChromeAI();
