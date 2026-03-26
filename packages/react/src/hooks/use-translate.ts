/**
 * @file use-translate.ts
 * @description Hook for text translation with @localmode/core translate()
 */

import type { TranslationModel, TranslateResult } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useTranslate hook */
interface UseTranslateOptions {
  /** The translation model to use */
  model: TranslationModel;
}

/** Input for translation */
interface TranslateInput {
  text: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}

/**
 * Hook for text translation.
 *
 * @param options - Translation model configuration
 * @returns Operation state with execute({ text, from?, to? }) function
 */
export function useTranslate(options: UseTranslateOptions) {
  const { model } = options;

  return useOperation<[TranslateInput], TranslateResult>({
    fn: async (input: TranslateInput, signal: AbortSignal) => {
      const { translate } = await import('@localmode/core');
      return translate({
        model,
        text: input.text,
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        abortSignal: signal,
      });
    },
  });
}
