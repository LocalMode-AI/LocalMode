/**
 * Chrome AI Provider
 *
 * Factory for creating Chrome AI model instances.
 *
 * @packageDocumentation
 */

import type { LanguageDetectionModel, LanguageModel } from '@localmode/core';
import type {
  ChromeAILanguageDetectorSettings,
  ChromeAILanguageModelSettings,
  ChromeAIProvider,
  ChromeAIProviderSettings,
  ChromeAISummarizerSettings,
  ChromeAITranslatorSettings,
} from './types.js';
import { ChromeAILanguageDetector } from './implementations/language-detector.js';
import { ChromeAILanguageModel } from './implementations/language-model.js';
import { ChromeAISummarizer } from './implementations/summarizer.js';
import { ChromeAITranslator } from './implementations/translator.js';

/**
 * Create a Chrome AI provider.
 *
 * @param settings - Optional provider-level settings
 * @returns Chrome AI provider with `summarizer()`, `translator()`,
 *   `languageDetector()`, and `languageModel()` factory methods.
 *
 * @example
 * ```ts
 * import { createChromeAI } from '@localmode/chrome-ai';
 *
 * const provider = createChromeAI();
 * const summarizer = provider.summarizer({ type: 'key-points' });
 * const translator = provider.translator({ targetLanguage: 'de' });
 * const detector = provider.languageDetector({ topK: 3 });
 * const llm = provider.languageModel({ systemPrompt: 'You are concise.' });
 * ```
 */
export function createChromeAI(_settings?: ChromeAIProviderSettings): ChromeAIProvider {
  return {
    summarizer(settings?: ChromeAISummarizerSettings): ChromeAISummarizer {
      return new ChromeAISummarizer(settings);
    },

    translator(settings?: ChromeAITranslatorSettings): ChromeAITranslator {
      return new ChromeAITranslator(settings);
    },

    languageModel(settings?: ChromeAILanguageModelSettings): LanguageModel {
      return new ChromeAILanguageModel(settings);
    },

    languageDetector(settings?: ChromeAILanguageDetectorSettings): LanguageDetectionModel {
      return new ChromeAILanguageDetector(settings);
    },
  };
}

/** Default Chrome AI provider instance */
export const chromeAI: ChromeAIProvider = createChromeAI();
