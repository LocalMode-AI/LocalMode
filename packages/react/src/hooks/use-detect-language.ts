/**
 * @file use-detect-language.ts
 * @description Hook for language detection with @localmode/core detectLanguage()
 */

import type { LanguageDetectionModel, DetectLanguageResult } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useDetectLanguage hook */
interface UseDetectLanguageOptions {
  /** The language detection model to use */
  model: LanguageDetectionModel;
  /** Maximum number of language candidates to return (default: 5) */
  maxResults?: number;
  /** Minimum confidence threshold for results (default: 0) */
  minConfidence?: number;
}

/**
 * Hook for detecting the language of a text string.
 *
 * @param options - Language detection model configuration
 * @returns Operation state with execute(text: string) function
 */
export function useDetectLanguage(options: UseDetectLanguageOptions) {
  const { model, maxResults, minConfidence } = options;

  return useOperation<[string], DetectLanguageResult>({
    fn: async (text: string, signal: AbortSignal) => {
      const { detectLanguage } = await import('@localmode/core');
      return detectLanguage({ model, text, maxResults, minConfidence, abortSignal: signal });
    },
  });
}
