/**
 * Kokoro TTS Integration Tests
 *
 * Unit tests for the Kokoro TTS integration: model detection, voice catalog,
 * and model class structure. These tests verify the code structure and
 * interface compliance without requiring actual model downloads.
 *
 * @packageDocumentation
 */

import { describe, it, expect } from 'vitest';
import {
  KOKORO_VOICES,
  KOKORO_DEFAULT_VOICE,
  KOKORO_LANG_MAP,
  TEXT_TO_SPEECH_MODELS,
  createTransformers,
} from '../src/index.js';
import { isKokoroModel, getKokoroVoiceIds } from '../src/implementations/kokoro-tts.js';
import { createTextToSpeechModel } from '../src/implementations/text-to-speech.js';
import type { KokoroVoice } from '../src/kokoro-voices.js';

// ═══════════════════════════════════════════════════════════════
// isKokoroModel() detection
// ═══════════════════════════════════════════════════════════════

describe('isKokoroModel()', () => {
  it('detects Kokoro model IDs', () => {
    expect(isKokoroModel('onnx-community/Kokoro-82M-v1.0-ONNX')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isKokoroModel('onnx-community/kokoro-82m-v1.0-onnx')).toBe(true);
    expect(isKokoroModel('ONNX-COMMUNITY/KOKORO-82M')).toBe(true);
  });

  it('rejects non-Kokoro model IDs', () => {
    expect(isKokoroModel('Xenova/mms-tts-eng')).toBe(false);
    expect(isKokoroModel('Xenova/speecht5_tts')).toBe(false);
    expect(isKokoroModel('some-random-model')).toBe(false);
  });

  it('handles edge cases', () => {
    expect(isKokoroModel('')).toBe(false);
    expect(isKokoroModel('kokoro')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// KOKORO_VOICES catalog
// ═══════════════════════════════════════════════════════════════

describe('KOKORO_VOICES', () => {
  it('contains 29 English voices', () => {
    expect(KOKORO_VOICES.length).toBe(29);
  });

  it('has no duplicate IDs', () => {
    const ids = KOKORO_VOICES.map(v => v.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('all voices have required fields', () => {
    for (const voice of KOKORO_VOICES) {
      expect(voice.id).toBeTruthy();
      expect(voice.name).toBeTruthy();
      expect(voice.language).toBeTruthy();
      expect(voice.languageLabel).toBeTruthy();
      expect(['female', 'male']).toContain(voice.gender);
    }
  });

  it('voice IDs follow naming convention [lang][gender]_[name]', () => {
    const validPrefixes = ['af', 'am', 'bf', 'bm'];
    for (const voice of KOKORO_VOICES) {
      if (voice.id === 'af') continue;
      const prefix = voice.id.split('_')[0];
      expect(validPrefixes).toContain(prefix);
    }
  });

  it('covers 2 English dialects', () => {
    const languages = new Set(KOKORO_VOICES.map(v => v.languageLabel));
    expect(languages.size).toBe(2);
    expect(languages).toContain('American English');
    expect(languages).toContain('British English');
  });

  it('all voices are English', () => {
    for (const voice of KOKORO_VOICES) {
      expect(voice.language).toMatch(/^en-/);
    }
  });

  it('gender matches voice ID prefix', () => {
    for (const voice of KOKORO_VOICES) {
      const genderChar = voice.id.charAt(1);
      if (genderChar === 'f') expect(voice.gender).toBe('female');
      if (genderChar === 'm') expect(voice.gender).toBe('male');
    }
  });
});

describe('KOKORO_DEFAULT_VOICE', () => {
  it('is a valid voice ID', () => {
    const ids = KOKORO_VOICES.map(v => v.id);
    expect(ids).toContain(KOKORO_DEFAULT_VOICE);
  });

  it('is af_heart', () => {
    expect(KOKORO_DEFAULT_VOICE).toBe('af_heart');
  });
});

describe('KOKORO_LANG_MAP', () => {
  it('maps English language prefixes', () => {
    expect(KOKORO_LANG_MAP['a']).toBe('en-us');
    expect(KOKORO_LANG_MAP['b']).toBe('en-gb');
  });

  it('has exactly 2 entries', () => {
    expect(Object.keys(KOKORO_LANG_MAP)).toHaveLength(2);
  });
});

describe('getKokoroVoiceIds()', () => {
  it('returns array of 29 string IDs', () => {
    const ids = getKokoroVoiceIds();
    expect(ids).toHaveLength(29);
    expect(ids.every(id => typeof id === 'string')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// TransformersTextToSpeechModel — Kokoro routing
// ═══════════════════════════════════════════════════════════════

describe('TransformersTextToSpeechModel (Kokoro)', () => {
  it('sets sampleRate to 24000 for Kokoro models', () => {
    const model = createTextToSpeechModel('onnx-community/Kokoro-82M-v1.0-ONNX');
    expect(model.sampleRate).toBe(24000);
  });

  it('populates voices array for Kokoro models', () => {
    const model = createTextToSpeechModel('onnx-community/Kokoro-82M-v1.0-ONNX');
    expect(model.voices).toHaveLength(29);
    expect(model.voices).toContain('af_heart');
    expect(model.voices).toContain('bf_emma');
    expect(model.voices).toContain('am_michael');
  });

  it('sets modelId with transformers prefix', () => {
    const model = createTextToSpeechModel('onnx-community/Kokoro-82M-v1.0-ONNX');
    expect(model.modelId).toBe('transformers:onnx-community/Kokoro-82M-v1.0-ONNX');
  });

  it('sets provider to transformers', () => {
    const model = createTextToSpeechModel('onnx-community/Kokoro-82M-v1.0-ONNX');
    expect(model.provider).toBe('transformers');
  });
});

// ═══════════════════════════════════════════════════════════════
// TransformersTextToSpeechModel — non-Kokoro (backward compat)
// ═══════════════════════════════════════════════════════════════

describe('TransformersTextToSpeechModel (non-Kokoro)', () => {
  it('uses default sampleRate (16000) for MMS-TTS', () => {
    const model = createTextToSpeechModel('Xenova/mms-tts-eng');
    expect(model.sampleRate).toBe(16000);
  });

  it('has empty voices array for non-Kokoro models', () => {
    const model = createTextToSpeechModel('Xenova/mms-tts-eng');
    expect(model.voices).toHaveLength(0);
  });

  it('uses default sampleRate (16000) for SpeechT5', () => {
    const model = createTextToSpeechModel('Xenova/speecht5_tts');
    expect(model.sampleRate).toBe(16000);
  });
});

// ═══════════════════════════════════════════════════════════════
// TEXT_TO_SPEECH_MODELS constant
// ═══════════════════════════════════════════════════════════════

describe('TEXT_TO_SPEECH_MODELS', () => {
  it('includes Kokoro model', () => {
    expect(TEXT_TO_SPEECH_MODELS.KOKORO_82M).toBe('onnx-community/Kokoro-82M-v1.0-ONNX');
  });

  it('includes SpeechT5 model', () => {
    expect(TEXT_TO_SPEECH_MODELS.SPEECHT5_TTS).toBe('Xenova/speecht5_tts');
  });
});

// ═══════════════════════════════════════════════════════════════
// Provider factory
// ═══════════════════════════════════════════════════════════════

describe('createTransformers().textToSpeech()', () => {
  it('creates Kokoro model with correct properties', () => {
    const provider = createTransformers();
    const model = provider.textToSpeech('onnx-community/Kokoro-82M-v1.0-ONNX');
    expect(model.sampleRate).toBe(24000);
    expect(model.voices).toHaveLength(29);
    expect(model.provider).toBe('transformers');
  });

  it('creates non-Kokoro model with generic properties', () => {
    const provider = createTransformers();
    const model = provider.textToSpeech('Xenova/mms-tts-eng');
    expect(model.sampleRate).toBe(16000);
    expect(model.voices).toHaveLength(0);
  });
});
