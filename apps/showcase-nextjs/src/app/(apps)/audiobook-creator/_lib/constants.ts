/**
 * @file constants.ts
 * @description App constants and configuration for audiobook-creator
 */

/** Model configuration */
export const MODEL_CONFIG = {
  /** Model ID for text-to-speech (MMS-TTS — multilingual VITS model, ~30MB) */
  modelId: 'Xenova/mms-tts-eng',
  /** Approximate model size for display */
  modelSize: '~30MB',
} as const;

/** Storage keys for persistence */
export const STORAGE_KEYS = {
  /** TTS store persistence key */
  tts: 'audiobook-creator-storage',
} as const;

/** Default sample text for demonstration */
export const DEFAULT_TEXT =
  'Welcome to LocalMode Audiobook Creator. This application converts your text into natural-sounding speech, entirely in your browser. No servers, no API keys. Your text never leaves your device.';

/** Maximum text length for synthesis */
export const MAX_TEXT_LENGTH = 5000;
