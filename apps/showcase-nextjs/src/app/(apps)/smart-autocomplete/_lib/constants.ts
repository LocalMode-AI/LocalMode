/**
 * @file constants.ts
 * @description Constants for the smart autocomplete application
 */

/** Model configuration */
export const MODEL_ID = 'onnx-community/ModernBERT-base-ONNX';
export const MODEL_SIZE = '150MB';
export const MASK_TOKEN = '[MASK]';

/** Sample sentences */
export const SAMPLE_SENTENCES = [
  'The weather today is very [MASK].',
  'I love to eat [MASK] for breakfast.',
  'Paris is the capital of [MASK].',
  'She is a very [MASK] person.',
  'The cat sat on the [MASK].',
];
