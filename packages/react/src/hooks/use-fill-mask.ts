/**
 * @file use-fill-mask.ts
 * @description Hook for fill-mask predictions with @localmode/core fillMask()
 */

import type { FillMaskModel, FillMaskResult } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useFillMask hook */
interface UseFillMaskOptions {
  /** The fill-mask model to use */
  model: FillMaskModel;
  /** Number of predictions to return */
  topK?: number;
}

/**
 * Hook for fill-mask predictions (e.g., "The weather is [MASK] today").
 *
 * @param options - Fill-mask model configuration
 * @returns Operation state with execute(text: string) function
 */
export function useFillMask(options: UseFillMaskOptions) {
  const { model, topK } = options;

  return useOperation<[string], FillMaskResult>({
    fn: async (text: string, signal: AbortSignal) => {
      const { fillMask } = await import('@localmode/core');
      return fillMask({ model, text, topK, abortSignal: signal });
    },
  });
}
