/**
 * @file constants.ts
 * @description Constants for the OCR scanner application
 */
import type { OCRModelEntry, OCRMode } from './types';

/** Available OCR models */
export const OCR_MODELS: OCRModelEntry[] = [
  {
    id: 'Xenova/trocr-small-printed',
    name: 'TrOCR Small',
    size: '~120MB',
    generative: false,
    description: 'Fast line-level printed text recognition',
  },
  {
    id: 'onnx-community/GLM-OCR-ONNX',
    name: 'GLM-OCR',
    size: '~652MB',
    generative: true,
    description: 'Document-level OCR with table & formula support',
  },
  {
    id: 'onnx-community/LightOnOCR-2-1B-ONNX',
    name: 'LightOnOCR-2',
    size: '~700MB',
    generative: true,
    description: 'Fast end-to-end document OCR, 11 languages',
  },
];

/** Default model (TrOCR for quick starts) */
export const DEFAULT_MODEL_ID = OCR_MODELS[0].id;

/** OCR modes for generative models */
export const OCR_MODES: OCRMode[] = [
  { id: 'text', label: 'Text', prompt: 'Text Recognition:' },
  { id: 'table', label: 'Table', prompt: 'Table Recognition:' },
  { id: 'formula', label: 'Formula', prompt: 'Formula Recognition:' },
];

/** Default OCR mode */
export const DEFAULT_MODE_ID = 'text';

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
