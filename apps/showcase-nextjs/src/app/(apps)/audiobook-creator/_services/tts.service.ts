/**
 * @file tts.service.ts
 * @description Service for text-to-speech model creation using @localmode/transformers
 */
import { transformers, KOKORO_VOICES } from '@localmode/transformers';
import type { KokoroVoice } from '@localmode/transformers';
import { MODEL_CONFIG } from '../_lib/constants';

/** Create the text-to-speech model instance */
export function createTTSModel() {
  return transformers.textToSpeech(MODEL_CONFIG.modelId);
}

/** Get available voices for the Kokoro model */
export function getVoices(): readonly KokoroVoice[] {
  return KOKORO_VOICES;
}

/** Get voices grouped by language */
export function getVoicesByLanguage() {
  const groups = new Map<string, KokoroVoice[]>();
  for (const voice of KOKORO_VOICES) {
    const existing = groups.get(voice.languageLabel) ?? [];
    existing.push(voice);
    groups.set(voice.languageLabel, existing);
  }
  return groups;
}
