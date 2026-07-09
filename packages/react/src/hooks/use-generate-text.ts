/**
 * @file use-generate-text.ts
 * @description Hook for non-streaming text generation with @localmode/core generateText()
 */

import type { ChatMessage, LanguageModel, GenerateTextResult } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useGenerateText hook */
export interface UseGenerateTextOptions {
  /** The language model to use */
  model: LanguageModel;
  /** System prompt to include in all requests */
  systemPrompt?: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Sampling temperature */
  temperature?: number;
  /** Top-p sampling */
  topP?: number;
  /** Stop sequences */
  stopSequences?: string[];
}

/** Per-call options for useGenerateText's execute() function */
export interface GenerateTextExecuteOptions {
  /** Messages for chat-style generation, passed through to generateText() */
  messages?: ChatMessage[];
}

/**
 * Hook for non-streaming text generation.
 *
 * @param options - Language model and generation configuration
 * @returns Operation state with execute(prompt, options?) function
 *
 * @example
 * ```tsx
 * const { data, isLoading, execute } = useGenerateText({
 *   model,
 *   systemPrompt: 'You are concise.',
 *   topP: 0.9,
 * });
 *
 * await execute('Summarize this');
 * await execute('Follow-up', { messages: priorMessages });
 * ```
 */
export function useGenerateText(options: UseGenerateTextOptions) {
  const { model, systemPrompt, maxTokens, temperature, topP, stopSequences } = options;

  return useOperation<[string, GenerateTextExecuteOptions?], GenerateTextResult>({
    // useOperation appends the AbortSignal as the LAST argument, so when the
    // caller omits executeOptions the signal arrives in its position.
    fn: async (
      prompt: string,
      executeOptionsOrSignal?: GenerateTextExecuteOptions | AbortSignal,
      maybeSignal?: AbortSignal
    ) => {
      const optionsOmitted = executeOptionsOrSignal instanceof AbortSignal;
      const signal = optionsOmitted ? executeOptionsOrSignal : maybeSignal;
      const executeOptions = optionsOmitted ? undefined : executeOptionsOrSignal;

      const { generateText } = await import('@localmode/core');
      return generateText({
        model,
        prompt,
        systemPrompt,
        messages: executeOptions?.messages,
        maxTokens,
        temperature,
        topP,
        stopSequences,
        abortSignal: signal,
      });
    },
  });
}
