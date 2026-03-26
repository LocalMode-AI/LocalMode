/**
 * @file constants.ts
 * @description Constants for the sentiment analyzer application
 */

/** Model configuration */
export const MODEL_ID = 'Xenova/distilbert-base-uncased-finetuned-sst-2-english';
export const MODEL_SIZE = '67MB';

/** Storage keys for persistence */
export const STORAGE_KEYS = {
  sentiment: 'sentiment-analyzer-storage',
} as const;

/** Sample texts for demo */
export const SAMPLE_TEXTS = [
  'This product is amazing! Best purchase I ever made.',
  'Terrible experience. The item broke after one day.',
  'Pretty average product, nothing special about it.',
  'I love how easy this is to use. Highly recommend!',
  'Waste of money. Customer support was unhelpful too.',
  'Great quality and fast shipping. Will buy again.',
];
