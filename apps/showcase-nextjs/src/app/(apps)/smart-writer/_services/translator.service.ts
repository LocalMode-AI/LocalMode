/**
 * @file translator.service.ts
 * @description Service for providing translation models with Chrome AI / Transformers.js fallback
 */
import type { TranslationModel } from '@localmode/core';
import type { ActiveProvider } from '../_lib/types';

/** Cache of loaded translator models keyed by target language */
const modelCache = new Map<string, TranslationModel>();

/** Get the active translation provider */
export function getTranslatorProvider(): ActiveProvider {
  if (typeof self !== 'undefined' && 'ai' in self && 'translator' in (self as any).ai) {
    return 'chrome-ai';
  }
  return 'transformers';
}

/** Get or create a translation model for a language pair */
export async function getTranslatorModel(targetLanguage: string, modelId: string): Promise<TranslationModel> {
  const key = `${targetLanguage}`;
  if (modelCache.has(key)) return modelCache.get(key)!;

  let model: TranslationModel;
  if (getTranslatorProvider() === 'chrome-ai') {
    const { chromeAI } = await import('@localmode/chrome-ai');
    model = chromeAI.translator({ sourceLanguage: 'en', targetLanguage });
  } else {
    const { transformers } = await import('@localmode/transformers');
    model = transformers.translator(modelId);
  }

  modelCache.set(key, model);
  return model;
}
