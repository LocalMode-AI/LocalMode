/**
 * @file use-classify-zero-shot.ts
 * @description Hook for zero-shot text classification
 */

import type { ZeroShotClassificationModel, ClassifyZeroShotResult } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useClassifyZeroShot hook */
interface UseClassifyZeroShotOptions {
  /** The zero-shot classification model to use */
  model: ZeroShotClassificationModel;
}

/** Input for zero-shot classification */
interface ClassifyZeroShotInput {
  text: string;
  candidateLabels: string[];
}

/**
 * Hook for zero-shot text classification with custom labels.
 *
 * @param options - Zero-shot classification model configuration
 * @returns Operation state with execute({ text, labels }) function
 */
export function useClassifyZeroShot(options: UseClassifyZeroShotOptions) {
  const { model } = options;

  return useOperation<[ClassifyZeroShotInput], ClassifyZeroShotResult>({
    fn: async (input: ClassifyZeroShotInput, signal: AbortSignal) => {
      const { classifyZeroShot } = await import('@localmode/core');
      return classifyZeroShot({
        model,
        text: input.text,
        candidateLabels: input.candidateLabels,
        abortSignal: signal,
      });
    },
  });
}
