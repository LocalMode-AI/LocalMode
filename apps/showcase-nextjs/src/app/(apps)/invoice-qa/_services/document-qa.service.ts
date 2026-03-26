/**
 * @file document-qa.service.ts
 * @description Service providing the document QA model instance for @localmode/react hooks.
 *
 * The QA logic previously in this service has been replaced by the
 * useAskDocument hook from @localmode/react, which wraps @localmode/core's
 * askDocument() with built-in loading state, error handling, and cancellation.
 *
 * See _hooks/use-document-qa.ts for the current implementation.
 */
import { transformers } from '@localmode/transformers';
import { MODEL_CONFIG } from '../_lib/constants';

/** Cached model instance */
let model: ReturnType<typeof transformers.documentQA> | null = null;

/**
 * Get or create the document QA model
 * @returns A DocumentQAModel instance
 */
export function getDocumentQAModel() {
  if (!model) {
    model = transformers.documentQA(MODEL_CONFIG.modelId);
  }
  return model;
}
