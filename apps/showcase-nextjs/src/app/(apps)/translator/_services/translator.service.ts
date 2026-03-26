/**
 * @file translator.service.ts
 * @description Service for creating translation model instances via @localmode/transformers
 */
import { transformers } from '@localmode/transformers';

/** Cache of loaded model instances keyed by model ID */
const modelCache = new Map<string, ReturnType<typeof transformers.translator>>();

/** Get or create a translator model */
export function getModel(modelId: string) {
  if (!modelCache.has(modelId)) {
    modelCache.set(modelId, transformers.translator(modelId));
  }
  return modelCache.get(modelId)!;
}
