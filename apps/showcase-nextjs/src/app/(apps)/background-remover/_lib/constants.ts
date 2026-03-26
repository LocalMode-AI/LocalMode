/**
 * @file constants.ts
 * @description App constants and configuration for background-remover
 */

/** Model configuration */
export const MODEL_CONFIG = {
  /** Model ID for background removal */
  modelId: 'briaai/RMBG-1.4',
  /** Approximate model size for display */
  modelSize: '~170MB',
} as const;

/** Storage keys for persistence */
export const STORAGE_KEYS = {
  /** Segmenter store persistence key */
  segmenter: 'background-remover-storage',
} as const;

/** Accepted image file types */
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
