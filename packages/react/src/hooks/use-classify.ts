/**
 * @file use-classify.ts
 * @description Hook for text classification with @localmode/core classify()
 */

import type { ClassificationModel, ClassifyResult } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useClassify hook */
interface UseClassifyOptions {
  /** The classification model to use */
  model: ClassificationModel;
}

/**
 * Hook for text classification.
 *
 * @param options - Classification model configuration
 * @returns Operation state with execute(text: string) function
 */
export function useClassify(options: UseClassifyOptions) {
  const { model } = options;

  return useOperation<[string], ClassifyResult>({
    fn: async (text: string, signal: AbortSignal) => {
      const { classify } = await import('@localmode/core');
      return classify({ model, text, abortSignal: signal });
    },
  });
}
