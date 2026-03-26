/**
 * @file constants.ts
 * @description App constants and configuration for voice-notes
 */

/** Model configuration */
export const MODEL_CONFIG = {
  /** Model ID for speech-to-text */
  modelId: 'onnx-community/moonshine-tiny-ONNX',
  /** Approximate model size for display */
  modelSize: '~50MB',
} as const;

/** Storage keys for persistence */
export const STORAGE_KEYS = {
  /** Notes store persistence key */
  notes: 'voice-notes-storage',
} as const;

/** Audio recording configuration */
export const AUDIO_CONFIG = {
  /** MIME type for recording */
  mimeType: 'audio/webm',
  /** Fallback MIME type */
  fallbackMimeType: 'audio/ogg',
} as const;
