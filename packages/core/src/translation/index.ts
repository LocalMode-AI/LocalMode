/**
 * Translation Domain
 *
 * Functions and types for text translation.
 *
 * @packageDocumentation
 */

// ═══════════════════════════════════════════════════════════════
// FUNCTIONS
// ═══════════════════════════════════════════════════════════════

export { translate, translateMany, setGlobalTranslationProvider } from './translate.js';

// Language Detection
export {
  detectLanguage,
  setGlobalLanguageDetectionProvider,
} from './detect-language.js';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

export { SUPPORTED_LANGUAGES, getLanguageName } from './languages.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type {
  // Common types
  TranslationUsage,
  TranslationResponse,
  // Model interface
  TranslationModel,
  DoTranslateOptions,
  DoTranslateResult,
  // translate() types
  TranslateOptions,
  TranslateResult,
  // translateMany() types
  TranslateManyOptions,
  TranslateManyResult,
  // Language detection
  LanguageDetectionModel,
  DoDetectLanguageOptions,
  DoDetectLanguageResult,
  DetectedLanguage,
  DetectLanguageOptions,
  DetectLanguageResult,
  // Factory types
  TranslationModelFactory,
  LanguageDetectionModelFactory,
} from './types.js';
