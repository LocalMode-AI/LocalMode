/**
 * @file qa.service.ts
 * @description Model factory for extractive QA using @localmode/transformers
 */
import { transformers } from '@localmode/transformers';
import { MODEL_ID } from '../_lib/constants';

/** Cached model instance */
let model: ReturnType<typeof transformers.questionAnswering> | null = null;

/** Get or create the QA model instance */
export function getModel() {
  if (!model) {
    model = transformers.questionAnswering(MODEL_ID);
  }
  return model;
}
