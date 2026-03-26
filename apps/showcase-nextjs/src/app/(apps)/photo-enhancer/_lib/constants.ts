/**
 * @file constants.ts
 * @description App constants and configuration for photo-enhancer
 */

/** Model configuration */
export const MODEL_CONFIG = {
  /** Model ID for super resolution */
  modelId: 'Xenova/swin2SR-lightweight-x2-64',
  /** Approximate model size for display */
  modelSize: '~50MB',
} as const;

/** Storage keys for persistence */
export const STORAGE_KEYS = {
  /** Enhancer store persistence key */
  enhancer: 'photo-enhancer-storage',
} as const;

/** Accepted image file types */
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
