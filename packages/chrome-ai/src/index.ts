/**
 * @localmode/chrome-ai
 *
 * Chrome AI provider for local-first AI. Your application ships and fetches no model
 * files — Chrome supplies the built-in models.
 *
 * @packageDocumentation
 */

// Provider
export { createChromeAI, chromeAI } from './provider.js';

// Implementations
export { ChromeAILanguageDetector } from './implementations/language-detector.js';
export { ChromeAILanguageModel } from './implementations/language-model.js';
export { ChromeAISummarizer } from './implementations/summarizer.js';
export { ChromeAITranslator } from './implementations/translator.js';

// Utilities
export {
  getChromeBuildInfo,
  isChromeAISupported,
  isLanguageDetectorSupported,
  isPromptAPISupported,
  isSummarizerAPISupported,
  isTranslatorAPISupported,
} from './utils.js';

// Types
export type {
  ChromeAIProvider,
  ChromeAIProviderSettings,
  ChromeAILanguageDetectorSettings,
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
  AILanguageDetector,
  AILanguageDetectorFactory,
  AILanguageDetectorCreateOptions,
  AILanguageDetectionResult,
  ChromeAIStreamChunk,
  ChromeAIStreamTiming,
  ChromeAIStreamSummarizeOptions,
  ChromeAIStreamTranslateOptions,
  ChromeAIModelInfo,
  ChromeAIAvailabilityAtCreate,
  ChromeAISummarizerInfoOptions,
  ChromeAITranslatorInfoOptions,
  ChromeBuildInfo,
  ChromeBrandVersion,
} from './types.js';
