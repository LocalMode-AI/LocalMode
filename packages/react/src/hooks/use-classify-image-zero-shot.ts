/**
 * @file use-classify-image-zero-shot.ts
 * @description Hook for zero-shot image classification with @localmode/core classifyImageZeroShot()
 */

import type { ZeroShotImageClassificationModel, ClassifyImageZeroShotResult } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useClassifyImageZeroShot hook */
interface UseClassifyImageZeroShotOptions {
  /** The zero-shot image classification model to use */
  model: ZeroShotImageClassificationModel;
}

/** Input for zero-shot image classification */
interface ClassifyImageZeroShotInput {
  image: string;
  candidateLabels: string[];
}

/**
 * Hook for zero-shot image classification with custom labels.
 *
 * @param options - Zero-shot image classification model configuration
 * @returns Operation state with execute({ image, candidateLabels }) function
 */
export function useClassifyImageZeroShot(options: UseClassifyImageZeroShotOptions) {
  const { model } = options;

  return useOperation<[ClassifyImageZeroShotInput], ClassifyImageZeroShotResult>({
    fn: async (input: ClassifyImageZeroShotInput, signal: AbortSignal) => {
      const { classifyImageZeroShot } = await import('@localmode/core');
      return classifyImageZeroShot({
        model,
        image: input.image,
        candidateLabels: input.candidateLabels,
        abortSignal: signal,
      });
    },
  });
}
