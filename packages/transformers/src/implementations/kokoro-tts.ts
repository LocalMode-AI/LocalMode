/**
 * Kokoro TTS Implementation
 *
 * Direct implementation of Kokoro-82M synthesis using:
 * - StyleTextToSpeech2Model from @huggingface/transformers v4
 * - phonemizer npm package (eSpeak-NG WASM) for text→phoneme conversion
 * - Voice .bin files from HuggingFace model repo
 *
 * Avoids the kokoro-js package to prevent a transformers v3/v4 version conflict.
 *
 * @packageDocumentation
 */

import type { TransformersDevice, ModelLoadProgress } from '../types.js';
import { KOKORO_VOICES, KOKORO_DEFAULT_VOICE, KOKORO_LANG_MAP } from '../kokoro-voices.js';

const STYLE_DIM = 256;
const MAX_PHONEME_TOKENS = 510;
const KOKORO_SAMPLE_RATE = 24000;

type KokoroDtype = 'q8' | 'fp16' | 'fp32' | 'q4' | 'q4f16';

interface KokoroInstance {
  model: { (inputs: Record<string, unknown>): Promise<{ waveform: { data: Float32Array } }> };
  tokenizer: { (text: string, options: { truncation: boolean }): { input_ids: unknown } };
}

const voiceDataCache = new Map<string, Float32Array>();

let kokoroInstance: KokoroInstance | null = null;
let kokoroLoadPromise: Promise<KokoroInstance> | null = null;

/** Check if a model ID is a Kokoro model */
export function isKokoroModel(modelId: string): boolean {
  return modelId.toLowerCase().includes('kokoro');
}

async function loadKokoroInstance(
  modelId: string,
  dtype: KokoroDtype,
  device: TransformersDevice,
  onProgress?: (progress: ModelLoadProgress) => void,
): Promise<KokoroInstance> {
  if (kokoroInstance) return kokoroInstance;
  if (kokoroLoadPromise) return kokoroLoadPromise;

  kokoroLoadPromise = (async () => {
    try {
      const { StyleTextToSpeech2Model, AutoTokenizer, env } = await import('@huggingface/transformers');
      env.backends.onnx.logLevel = 'error';

      const model = await StyleTextToSpeech2Model.from_pretrained(modelId, {
        dtype,
        device,
        progress_callback: onProgress,
      });
      const tokenizer = await AutoTokenizer.from_pretrained(modelId);

      kokoroInstance = {
        model: (inputs: Record<string, unknown>) => (model as unknown as { (inputs: Record<string, unknown>): Promise<{ waveform: { data: Float32Array } }> })(inputs),
        tokenizer: (text: string, options: { truncation: boolean }) => tokenizer(text, options) as { input_ids: unknown },
      };
      return kokoroInstance;
    } catch (error) {
      kokoroLoadPromise = null;
      throw error;
    }
  })();

  return kokoroLoadPromise;
}

async function fetchVoiceData(voiceId: string, modelId: string): Promise<Float32Array> {
  const cached = voiceDataCache.get(voiceId);
  if (cached) return cached;

  const url = `https://huggingface.co/${modelId}/resolve/main/voices/${voiceId}.bin`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch voice data for '${voiceId}' (HTTP ${response.status}). ` +
      `Available voices: ${KOKORO_VOICES.map(v => v.id).join(', ')}`
    );
  }
  const buffer = await response.arrayBuffer();
  const data = new Float32Array(buffer);
  voiceDataCache.set(voiceId, data);
  return data;
}

function getVoiceSlice(voiceData: Float32Array, numTokens: number): Float32Array {
  const clampedTokens = Math.min(Math.max(numTokens, 0), MAX_PHONEME_TOKENS - 1);
  const offset = clampedTokens * STYLE_DIM;
  return voiceData.slice(offset, offset + STYLE_DIM);
}

function getLanguageForVoice(voiceId: string): string {
  const langChar = voiceId.charAt(0);
  return KOKORO_LANG_MAP[langChar] ?? 'en-us';
}

/**
 * Normalize text before phonemization — handles common abbreviations
 * and number-like patterns. Ported from kokoro-js's normalize logic.
 */
function normalizeText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Post-process phonemes — apply kokoro-specific IPA fixes.
 * Ported from kokoro-js's phonemize.js post-processing.
 */
function postProcessPhonemes(phonemes: string, language: string): string {
  let result = phonemes;
  if (language.startsWith('en')) {
    result = result.replace(/r/g, 'ɹ');
    result = result.replace(/x/g, 'k');
    result = result.replace(/ɬ/g, 'l');
  }
  return result;
}

async function phonemizeText(text: string, voiceId: string): Promise<string> {
  const { phonemize } = await import('phonemizer');
  const language = getLanguageForVoice(voiceId);
  const normalized = normalizeText(text);

  const parts = normalized.split(/([.!?;:,\-—\s]+)/);
  const phonemized: string[] = [];

  for (const part of parts) {
    if (/^[.!?;:,\-—\s]+$/.test(part)) {
      phonemized.push(part);
    } else if (part.trim()) {
      const result = await phonemize(part, language);
      const joined = result.join(' ');
      phonemized.push(postProcessPhonemes(joined, language));
    }
  }

  return phonemized.join('');
}

/**
 * Synthesize speech using Kokoro-82M directly via transformers v4.
 *
 * Pipeline: text → normalize → phonemize (eSpeak-NG) → tokenize → ONNX inference → WAV Blob
 */
export async function kokoroSynthesize(options: {
  modelId: string;
  text: string;
  voice?: string;
  speed?: number;
  dtype?: KokoroDtype;
  device?: TransformersDevice;
  abortSignal?: AbortSignal;
  onProgress?: (progress: ModelLoadProgress) => void;
}): Promise<{
  audio: Float32Array;
  sampleRate: number;
}> {
  const {
    modelId,
    text,
    voice = KOKORO_DEFAULT_VOICE,
    speed = 1.0,
    dtype = 'q8',
    device = 'wasm',
    abortSignal,
    onProgress,
  } = options;

  abortSignal?.throwIfAborted();

  const validVoiceIds = KOKORO_VOICES.map(v => v.id);
  if (!validVoiceIds.includes(voice)) {
    throw new Error(
      `Invalid Kokoro voice '${voice}'. Available voices: ${validVoiceIds.join(', ')}`
    );
  }

  const instance = await loadKokoroInstance(modelId, dtype, device, onProgress);

  abortSignal?.throwIfAborted();

  const phonemes = await phonemizeText(text, voice);

  abortSignal?.throwIfAborted();

  const tokenized = instance.tokenizer(phonemes, { truncation: true });

  const inputIds = tokenized.input_ids;
  const numTokens = Math.min(
    Math.max(((inputIds as { dims?: number[] }).dims?.at(-1) ?? 0) - 2, 0),
    MAX_PHONEME_TOKENS - 1
  );

  const voiceData = await fetchVoiceData(voice, modelId);

  abortSignal?.throwIfAborted();

  const voiceSlice = getVoiceSlice(voiceData, numTokens);

  const { Tensor } = await import('@huggingface/transformers');
  const inputs = {
    input_ids: inputIds,
    style: new Tensor('float32', voiceSlice, [1, STYLE_DIM]),
    speed: new Tensor('float32', new Float32Array([speed]), [1]),
  };

  const output = await instance.model(inputs);
  const waveform = output.waveform.data;

  return {
    audio: waveform,
    sampleRate: KOKORO_SAMPLE_RATE,
  };
}

/** Get all valid Kokoro voice IDs */
export function getKokoroVoiceIds(): string[] {
  return KOKORO_VOICES.map(v => v.id);
}
