/**
 * @file summarizer.service.ts
 * @description Service for summarization model creation using @localmode/transformers
 */
import { transformers } from '@localmode/transformers';
import { SUMMARIZER_MODEL_ID } from '../_lib/constants';

/** Cached model instance */
let model: ReturnType<typeof transformers.summarizer> | null = null;

/**
 * Get or create the summarization model
 * @returns A SummarizationModel instance for use with useSummarize
 */
export function getSummarizerModel() {
  if (!model) {
    model = transformers.summarizer(SUMMARIZER_MODEL_ID);
  }
  return model;
}
