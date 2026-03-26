/**
 * @file use-summarizer.ts
 * @description Thin wrapper around useSummarize from @localmode/react
 */
import { useSummarize, toAppError } from '@localmode/react';
import { getModel } from '../_services/summarizer.service';
import { LENGTH_CONFIGS } from '../_lib/constants';
import type { SummaryLength } from '../_lib/types';

/** Hook for text summarization */
export function useSummarizer() {
  const { data, error, isLoading, execute, cancel, reset } = useSummarize({ model: getModel() });

  const handleSummarize = async (text: string, length: SummaryLength) => {
    if (!text.trim()) return;
    const config = LENGTH_CONFIGS[length];
    await execute({ text, maxLength: config.maxLength, minLength: config.minLength });
  };

  return {
    summary: data?.summary ?? '',
    isSummarizing: isLoading,
    error: toAppError(error),
    handleSummarize,
    cancel,
    clearError: reset,
  };
}
