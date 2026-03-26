/**
 * @file use-ask-document.ts
 * @description Hook for document QA with @localmode/core askDocument()
 */

import type { DocumentQAModel, AskDocumentResult } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useAskDocument hook */
interface UseAskDocumentOptions {
  /** The document QA model to use */
  model: DocumentQAModel;
}

/** Input for document QA */
interface AskDocumentInput {
  document: string;
  question: string;
}

/**
 * Hook for document question answering on images.
 *
 * @param options - Document QA model configuration
 * @returns Operation state with execute({ image, question }) function
 */
export function useAskDocument(options: UseAskDocumentOptions) {
  const { model } = options;

  return useOperation<[AskDocumentInput], AskDocumentResult>({
    fn: async (input: AskDocumentInput, signal: AbortSignal) => {
      const { askDocument } = await import('@localmode/core');
      return askDocument({
        model,
        document: input.document,
        question: input.question,
        abortSignal: signal,
      });
    },
  });
}
