/**
 * @file captioner.service.ts
 * @description Service for providing the image captioning model via @localmode/transformers
 */
import { transformers } from '@localmode/transformers';
import { MODEL_ID } from '../_lib/constants';

/** Cached model instance */
let model: ReturnType<typeof transformers.captioner> | null = null;

/** Get or create the captioning model */
export function getCaptionerModel() {
  if (!model) {
    model = transformers.captioner(MODEL_ID);
  }
  return model;
}
