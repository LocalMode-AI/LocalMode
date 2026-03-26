/**
 * @file use-classifier.ts
 * @description Hook for managing email classification using useOperationList from @localmode/react
 */
import { useOperationList, toAppError } from '@localmode/react';
import type { ClassifyZeroShotResult } from '@localmode/core';
import { getModel } from '../_services/classifier.service';
import type { ClassificationResult } from '../_lib/types';

/** Hook for orchestrating email classification operations */
export function useClassifier() {
  const { items, isLoading, error, execute, cancel, reset, clearItems } = useOperationList<
    [{ text: string; candidateLabels: string[] }], ClassifyZeroShotResult, ClassificationResult[]
  >({
    fn: async (input: { text: string; candidateLabels: string[] }, signal: AbortSignal) => {
      const { classifyZeroShot } = await import('@localmode/core');
      return classifyZeroShot({ model: getModel(), text: input.text, candidateLabels: input.candidateLabels, abortSignal: signal });
    },
    transform: (result) => result.labels.map((label, i) => ({ label, score: result.scores[i] })),
  });

  /** Latest classification results (most recent run) */
  const results = items[0] ?? [];

  /** Classify the email input against selected categories */
  const classify = async (input: string, categories: string[]) => {
    if (!input.trim() || categories.length === 0) return;
    await execute({ text: input, candidateLabels: categories });
  };

  return {
    results, isClassifying: isLoading,
    error: toAppError(error),
    classify, cancel, clearError: reset, clearResults: clearItems,
  };
}
