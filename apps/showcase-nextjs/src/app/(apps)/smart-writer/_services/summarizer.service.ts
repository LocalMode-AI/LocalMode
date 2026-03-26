/**
 * @file summarizer.service.ts
 * @description Service for providing the summarization model with Chrome AI / Transformers.js fallback
 */
import type { SummarizationModel } from '@localmode/core';
import type { ActiveProvider } from '../_lib/types';
import { SUMMARIZER_MODEL_ID } from '../_lib/constants';

/** Get the active summarization provider */
export function getActiveProvider(): ActiveProvider {
  if (typeof self !== 'undefined' && 'ai' in self && 'summarizer' in (self as any).ai) {
    return 'chrome-ai';
  }
  return 'transformers';
}

/** Get or create the summarization model */
export async function getSummarizerModel(): Promise<SummarizationModel> {
  if (getActiveProvider() === 'chrome-ai') {
    const { chromeAI } = await import('@localmode/chrome-ai');
    return chromeAI.summarizer();
  }
  const { transformers } = await import('@localmode/transformers');
  return transformers.summarizer(SUMMARIZER_MODEL_ID);
}
