/**
 * @file use-translator.ts
 * @description Thin wrapper around useTranslate from @localmode/react
 */
import { useTranslate, toAppError } from '@localmode/react';
import { getModel } from '../_services/translator.service';
import { LANGUAGE_PAIRS } from '../_lib/constants';

/** Hook for translation operations */
export function useTranslator() {
  const { data, error, isLoading, execute, cancel, reset } = useTranslate({
    model: getModel(LANGUAGE_PAIRS[0].modelId),
  });

  const handleTranslate = async (input: string, pairIndex: number) => {
    if (!input.trim()) return;
    const pair = LANGUAGE_PAIRS[pairIndex];
    await execute({ text: input, sourceLanguage: pair.source, targetLanguage: pair.target });
  };

  return {
    translation: data?.translation ?? '',
    isTranslating: isLoading,
    error: toAppError(error),
    handleTranslate,
    cancel,
    clearError: reset,
  };
}
