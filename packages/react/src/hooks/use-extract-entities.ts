/**
 * @file use-extract-entities.ts
 * @description Hook for named entity recognition with @localmode/core extractEntities()
 */

import type { NERModel, ExtractEntitiesResult } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useExtractEntities hook */
interface UseExtractEntitiesOptions {
  /** The NER model to use */
  model: NERModel;
}

/**
 * Hook for named entity extraction (NER).
 *
 * @param options - NER model configuration
 * @returns Operation state with execute(text: string) function
 */
export function useExtractEntities(options: UseExtractEntitiesOptions) {
  const { model } = options;

  return useOperation<[string], ExtractEntitiesResult>({
    fn: async (text: string, signal: AbortSignal) => {
      const { extractEntities } = await import('@localmode/core');
      return extractEntities({ model, text, abortSignal: signal });
    },
  });
}
