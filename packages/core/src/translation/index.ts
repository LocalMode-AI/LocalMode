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
  // Factory types
  TranslationModelFactory,
} from './types.js';
