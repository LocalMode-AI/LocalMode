/**
 * @file constants.ts
 * @description App constants for voice-studio
 */

export const MODEL_CONFIG = {
  modelId: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  modelSize: '~86MB',
} as const;

export const PREVIEW_TEXT = 'Hello! This is a preview of this voice.';

export const SAMPLE_TEXTS = [
  'The quick brown fox jumps over the lazy dog. A wonderful journey through the countryside begins with a single step.',
  'In the beginning, there was silence. Then came the sound of waves crashing against ancient shores, a rhythm as old as time itself.',
  'Technology has transformed the way we communicate. Today, artificial intelligence runs entirely in your browser, no servers needed.',
  'Once upon a time, in a land far away, there lived a wise old owl who knew the secrets of the forest.',
] as const;

export const SPEED_MIN = 0.5;
export const SPEED_MAX = 2.0;
export const SPEED_STEP = 0.1;
export const SPEED_DEFAULT = 1.0;

export const MAX_TEXT_LENGTH = 5000;
