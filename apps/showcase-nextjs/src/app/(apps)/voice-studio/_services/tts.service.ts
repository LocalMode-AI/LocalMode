/**
 * @file tts.service.ts
 * @description TTS service for voice-studio using Kokoro
 */
import { transformers, KOKORO_VOICES } from '@localmode/transformers';
import type { KokoroVoice } from '@localmode/transformers';
import { MODEL_CONFIG } from '../_lib/constants';

export function createTTSModel() {
  return transformers.textToSpeech(MODEL_CONFIG.modelId);
}

export function getVoices(): readonly KokoroVoice[] {
  return KOKORO_VOICES;
}

export function getLanguageGroups() {
  const groups = new Map<string, KokoroVoice[]>();
  for (const voice of KOKORO_VOICES) {
    const list = groups.get(voice.languageLabel) ?? [];
    list.push(voice);
    groups.set(voice.languageLabel, list);
  }
  return groups;
}
