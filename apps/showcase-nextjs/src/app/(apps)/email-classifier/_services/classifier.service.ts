/**
 * @file classifier.service.ts
 * @description Service for creating the zero-shot classification model via @localmode/transformers
 */
import { transformers } from '@localmode/transformers';
import { MODEL_ID } from '../_lib/constants';

/** Cached model instance */
let model: ReturnType<typeof transformers.zeroShot> | null = null;

/**
 * Get or create the zero-shot classification model.
 * Returns a singleton model instance cached for the lifetime of the page.
 */
export function getModel() {
  if (!model) {
    model = transformers.zeroShot(MODEL_ID);
  }
  return model;
}
