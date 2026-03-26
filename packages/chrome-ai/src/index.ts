/**
 * @localmode/chrome-ai
 *
 * Chrome AI provider for local-first AI. Zero-download, instant inference
 * via Chrome's built-in Gemini Nano model.
 *
 * @packageDocumentation
 */

// Provider
export { createChromeAI, chromeAI } from './provider.js';

// Implementations
export { ChromeAISummarizer } from './implementations/summarizer.js';
export { ChromeAITranslator } from './implementations/translator.js';

// Utilities
export {
  isChromeAISupported,
  isSummarizerAPISupported,
  isTranslatorAPISupported,
} from './utils.js';

// Types
export type {
  ChromeAIProvider,
  ChromeAIProviderSettings,
  ChromeAISummarizerSettings,
  ChromeAITranslatorSettings,
  AISummarizer,
  AISummarizerFactory,
  AISummarizerCapabilities,
  AISummarizerCreateOptions,
  AITranslator,
  AITranslatorFactory,
  AITranslatorCapabilities,
  AITranslatorCreateOptions,
} from './types.js';
