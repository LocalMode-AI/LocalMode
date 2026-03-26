/**
 * @file tts.service.ts
 * @description Service for text-to-speech model creation using @localmode/transformers
 */
import { transformers } from '@localmode/transformers';
import { MODEL_CONFIG } from '../_lib/constants';

/**
 * Create the text-to-speech model instance
 * @returns TextToSpeechModel configured with the default model ID
 */
export function createTTSModel() {
  return transformers.textToSpeech(MODEL_CONFIG.modelId);
}
