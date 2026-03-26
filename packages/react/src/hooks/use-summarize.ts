/**
 * @file use-summarize.ts
 * @description Hook for text summarization with @localmode/core summarize()
 */

import type { SummarizationModel, SummarizeResult } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useSummarize hook */
interface UseSummarizeOptions {
  /** The summarization model to use */
  model: SummarizationModel;
}

/** Input for summarization */
interface SummarizeInput {
  /** Text to summarize */
  text: string;
  /** Maximum length of summary (in tokens or words) */
  maxLength?: number;
  /** Minimum length of summary (in tokens or words) */
  minLength?: number;
}

/**
 * Hook for text summarization.
 *
 * @param options - Summarization model configuration
 * @returns Operation state with execute(input) function
 *
 * @example
 * ```ts
 * const { data, isLoading, execute } = useSummarize({ model });
 * await execute({ text: 'long article...', maxLength: 130, minLength: 50 });
 * // data.summary contains the summarized text
 * ```
 */
export function useSummarize(options: UseSummarizeOptions) {
  const { model } = options;

  return useOperation<[SummarizeInput], SummarizeResult>({
    fn: async (input: SummarizeInput, signal: AbortSignal) => {
      const { summarize } = await import('@localmode/core');
      return summarize({
        model,
        text: input.text,
        maxLength: input.maxLength,
        minLength: input.minLength,
        abortSignal: signal,
      });
    },
  });
}
