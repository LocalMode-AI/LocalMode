/**
 * @file ocr.service.ts
 * @description Service providing OCR model instances for @localmode/react hooks.
 * Supports both TrOCR (TJS v3) and generative OCR models (TJS v4).
 */
import { transformers } from '@localmode/transformers';
import type { OCRModel } from '@localmode/core';

const modelCache = new Map<string, OCRModel>();

/** Returns a lazily-cached OCR model for the given model ID */
export function getOCRModel(modelId: string) {
  let model = modelCache.get(modelId);
  if (!model) {
    model = transformers.ocr(modelId);
    modelCache.set(modelId, model);
  }
  return model;
}
