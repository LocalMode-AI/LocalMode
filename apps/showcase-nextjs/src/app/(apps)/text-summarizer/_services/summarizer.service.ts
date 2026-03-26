/**
 * @file summarizer.service.ts
 * @description Service for providing the summarization model via @localmode/transformers
 */
import { transformers } from '@localmode/transformers';
import { MODEL_ID } from '../_lib/constants';

/** Cached model instance */
let model: ReturnType<typeof transformers.summarizer> | null = null;

/** Get or create the summarization model */
export function getModel() {
  if (!model) {
    model = transformers.summarizer(MODEL_ID);
  }
  return model;
}
