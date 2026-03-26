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
