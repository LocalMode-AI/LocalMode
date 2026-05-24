/**
 * @file constants.ts
 * @description App constants and configuration for audiobook-creator
 */

/** Model configuration */
export const MODEL_CONFIG = {
  modelId: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  modelSize: '~86MB',
} as const;

/** Storage keys for persistence */
export const STORAGE_KEYS = {
  tts: 'audiobook-creator-storage',
} as const;

/** Default sample text for demonstration */
export const DEFAULT_TEXT =
  'Welcome to LocalMode Audiobook Creator. This application converts your text into natural-sounding speech, entirely in your browser. No servers, no API keys. Your text never leaves your device.';

/** Maximum text length for synthesis */
export const MAX_TEXT_LENGTH = 10000;

/** Speed control range */
export const SPEED_MIN = 0.5;
export const SPEED_MAX = 2.0;
export const SPEED_STEP = 0.1;
export const SPEED_DEFAULT = 1.0;
