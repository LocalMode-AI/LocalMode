/**
 * @file constants.ts
 * @description App constants and configuration for object-detector
 */

/** Model configuration */
export const MODEL_CONFIG = {
  /** Model ID for object detection */
  modelId: 'Xenova/detr-resnet-50',
  /** Approximate model size for display */
  modelSize: '~42MB',
  /** Default confidence threshold */
  defaultThreshold: 0.5,
} as const;

/** Storage keys for persistence */
export const STORAGE_KEYS = {
  /** Detector store persistence key */
  detector: 'object-detector-storage',
} as const;

/** Accepted image file types */
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** Color palette for bounding box labels */
export const DETECTION_COLORS = [
  '#3b82f6',
  '#ef4444',
  '#22c55e',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
] as const;
