/**
 * @localmode/chrome-ai
 *
 * Chrome AI provider for local-first AI. Your application ships and fetches no model
 * files — Chrome supplies the built-in Gemini Nano model.
 *
 * @packageDocumentation
 */

// Provider
export { createChromeAI, chromeAI } from './provider.js';

// Implementations
export { ChromeAILanguageModel } from './implementations/language-model.js';
export { ChromeAISummarizer } from './implementations/summarizer.js';
export { ChromeAITranslator } from './implementations/translator.js';

// Utilities
export {
  isChromeAISupported,
  isPromptAPISupported,
  isSummarizerAPISupported,
  isTranslatorAPISupported,
} from './utils.js';

// Types
export type {
  ChromeAIProvider,
  ChromeAIProviderSettings,
  ChromeAILanguageModelSettings,
  ChromeAISummarizerSettings,
  ChromeAITranslatorSettings,
  AILanguageModel,
  AILanguageModelAvailability,
  ChromeAIAvailability,
  AILanguageModelCreateOptions,
  AILanguageModelFactory,
  AILanguageModelPromptOptions,
  AISummarizer,
  AISummarizerFactory,
  AISummarizerCapabilities,
  AISummarizerCreateOptions,
  AITranslator,
  AITranslatorFactory,
  AITranslatorCapabilities,
  AITranslatorCreateOptions,
} from './types.js';
