/**
 * @file use-qa.ts
 * @description Hook for managing QA operations using useOperationList from @localmode/react
 */
'use client';

import { useOperationList, toAppError } from '@localmode/react';
import type { AnswerQuestionResult } from '@localmode/core';
import { getModel } from '../_services/qa.service';
import type { QAEntry } from '../_lib/types';

/** Hook for asking questions and managing QA state */
export function useQA() {
  const { items: entries, isLoading, error, execute, cancel, reset, clearItems } = useOperationList<
    [{ question: string; context: string }], AnswerQuestionResult, QAEntry
  >({
    fn: async (input: { question: string; context: string }, signal: AbortSignal) => {
      const { answerQuestion } = await import('@localmode/core');
      return answerQuestion({ model: getModel(), question: input.question, context: input.context, abortSignal: signal });
    },
    transform: (result, input) => ({
      id: crypto.randomUUID(),
      question: input.question,
      result: { answer: result.answer, score: result.score, start: result.start, end: result.end },
    }),
  });

  const askQuestion = async (question: string, context: string) => {
    if (!question.trim() || !context.trim()) return;
    await execute({ question, context });
  };

  return {
    entries, isAnswering: isLoading,
    error: toAppError(error),
    askQuestion, cancel, clearError: reset, clearEntries: clearItems,
  };
}
