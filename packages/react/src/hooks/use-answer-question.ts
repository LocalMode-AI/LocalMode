/**
 * @file use-answer-question.ts
 * @description Hook for extractive question answering with @localmode/core answerQuestion()
 */

import type { QuestionAnsweringModel, AnswerQuestionResult } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useAnswerQuestion hook */
interface UseAnswerQuestionOptions {
  /** The question answering model to use */
  model: QuestionAnsweringModel;
}

/** Input for question answering */
interface AnswerQuestionInput {
  question: string;
  context: string;
}

/**
 * Hook for extractive question answering.
 *
 * @param options - Question answering model configuration
 * @returns Operation state with execute({ question, context }) function
 */
export function useAnswerQuestion(options: UseAnswerQuestionOptions) {
  const { model } = options;

  return useOperation<[AnswerQuestionInput], AnswerQuestionResult>({
    fn: async (input: AnswerQuestionInput, signal: AbortSignal) => {
      const { answerQuestion } = await import('@localmode/core');
      return answerQuestion({
        model,
        question: input.question,
        context: input.context,
        abortSignal: signal,
      });
    },
  });
}
