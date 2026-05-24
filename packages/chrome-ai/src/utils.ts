/**
 * Chrome AI Feature Detection Utilities
 *
 * @packageDocumentation
 */

/**
 * Check if Chrome Built-in AI is supported.
 *
 * @returns true if Chrome AI APIs are available
 */
export function isChromeAISupported(): boolean {
  return typeof self !== 'undefined' && 'ai' in self;
}

/**
 * Check if Chrome AI Summarizer API is supported.
 *
 * @returns true if the Summarizer API is available
 */
export function isSummarizerAPISupported(): boolean {
  if (!isChromeAISupported()) return false;
  return 'summarizer' in (self as any).ai;
}

/**
 * Check if Chrome AI Translator API is supported.
 *
 * @returns true if the Translator API is available
 */
export function isTranslatorAPISupported(): boolean {
  if (!isChromeAISupported()) return false;
  return 'translator' in (self as any).ai;
}

/**
 * Check if Chrome AI Prompt API (`window.LanguageModel`) is supported.
 *
 * Chrome 138+ stable exposes the Prompt API at the top-level `window.LanguageModel`.
 * Chrome 127–137 origin-trial builds exposed it as `self.ai.languageModel`. This detector
 * accepts either surface so apps written against current Chrome stable continue to work
 * during future namespace migrations.
 *
 * In non-Chromium browsers (Firefox, Safari, etc.) and in Node-like environments where
 * `self` is undefined, this returns `false` without throwing.
 *
 * @returns true if either `window.LanguageModel` or the legacy `self.ai.languageModel`
 *   surface is present; `false` otherwise.
 *
 * @example
 * ```ts
 * import { isPromptAPISupported } from '@localmode/chrome-ai';
 *
 * if (isPromptAPISupported()) {
 *   // Safe to call chromeAI.languageModel()
 * }
 * ```
 */
export function isPromptAPISupported(): boolean {
  if (typeof self === 'undefined') return false;
  if ('LanguageModel' in self) return true;
  const ai = (self as any).ai;
  return Boolean(ai && 'languageModel' in ai);
}

/**
 * Estimate token count from text.
 *
 * Uses a rough heuristic of ~0.75 words per token.
 *
 * @param text - Text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words / 0.75);
}
