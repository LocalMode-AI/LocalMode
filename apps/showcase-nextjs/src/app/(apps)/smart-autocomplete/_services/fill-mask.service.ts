/**
 * @file fill-mask.service.ts
 * @description Service for fill-mask model creation using @localmode/transformers
 */
import { transformers } from '@localmode/transformers';
import { MODEL_ID } from '../_lib/constants';

/** Cached model instance */
let model: ReturnType<typeof transformers.fillMask> | null = null;

/** Get or create the fill-mask model */
export function getModel() {
  if (!model) {
    model = transformers.fillMask(MODEL_ID);
  }
  return model;
}
