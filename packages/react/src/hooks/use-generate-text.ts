/**
 * @file use-generate-text.ts
 * @description Hook for non-streaming text generation with @localmode/core generateText()
 */

import type { LanguageModel, GenerateTextResult } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useGenerateText hook */
interface UseGenerateTextOptions {
  /** The language model to use */
  model: LanguageModel;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Sampling temperature */
  temperature?: number;
}

/**
 * Hook for non-streaming text generation.
 *
 * @param options - Language model and generation configuration
 * @returns Operation state with execute(prompt: string) function
 */
export function useGenerateText(options: UseGenerateTextOptions) {
  const { model, maxTokens, temperature } = options;

  return useOperation<[string], GenerateTextResult>({
    fn: async (prompt: string, signal: AbortSignal) => {
      const { generateText } = await import('@localmode/core');
      return generateText({
        model,
        prompt,
        maxTokens,
        temperature,
        abortSignal: signal,
      });
    },
  });
}
