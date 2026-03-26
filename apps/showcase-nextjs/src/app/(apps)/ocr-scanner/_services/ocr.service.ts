/**
 * @file ocr.service.ts
 * @description Service providing the OCR model instance for @localmode/react hooks
 */
import { transformers } from '@localmode/transformers';
import { MODEL_ID } from '../_lib/constants';

let model: ReturnType<typeof transformers.ocr> | null = null;

/** Returns a lazily-initialised OCR model singleton */
export function getOCRModel() {
  if (!model) {
    model = transformers.ocr(MODEL_ID);
  }
  return model;
}
