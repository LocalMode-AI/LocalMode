/**
 * @file use-autocomplete.ts
 * @description Thin wrapper around useFillMask from @localmode/react
 */
import { useFillMask, toAppError } from '@localmode/react';
import { getModel } from '../_services/fill-mask.service';
import { MASK_TOKEN } from '../_lib/constants';

/** Hook for autocomplete operations */
export function useAutocomplete() {
  const { data, error, isLoading, execute, cancel, reset } = useFillMask({ model: getModel(), topK: 5 });

  const predict = async (input: string) => {
    if (!input.includes(MASK_TOKEN)) return;
    await execute(input);
  };

  const suggestions = data?.predictions.map((p) => ({ token: p.token, score: p.score })) ?? [];

  return {
    suggestions,
    isProcessing: isLoading,
    error: toAppError(error),
    predict,
    cancel,
    clearError: reset,
    clearSuggestions: reset,
  };
}
