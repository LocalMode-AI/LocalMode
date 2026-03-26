/**
 * @file transcriber.service.ts
 * @description Service for speech-to-text model creation using @localmode/transformers
 */
import { transformers } from '@localmode/transformers';
import { WHISPER_MODEL_ID } from '../_lib/constants';

/** Cached model instance */
let model: ReturnType<typeof transformers.speechToText> | null = null;

/**
 * Get or create the speech-to-text model
 * @returns A SpeechToTextModel instance for use with useTranscribe
 */
export function getTranscriptionModel() {
  if (!model) {
    model = transformers.speechToText(WHISPER_MODEL_ID);
  }
  return model;
}
