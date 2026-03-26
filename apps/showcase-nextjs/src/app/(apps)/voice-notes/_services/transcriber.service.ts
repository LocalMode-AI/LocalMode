/**
 * @file transcriber.service.ts
 * @description Service for creating the speech-to-text model used by the transcription hook
 */
import { transformers } from '@localmode/transformers';
import { MODEL_CONFIG } from '../_lib/constants';

/**
 * Create a speech-to-text model instance for transcription
 * @returns SpeechToTextModel configured with the app's model ID
 */
export function createTranscriptionModel() {
  return transformers.speechToText(MODEL_CONFIG.modelId);
}
