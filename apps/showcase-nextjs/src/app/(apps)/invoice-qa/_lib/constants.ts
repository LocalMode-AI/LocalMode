/**
 * @file constants.ts
 * @description App constants and configuration for invoice-qa
 */

/** Model configuration */
export const MODEL_CONFIG = {
  /** Model ID for document QA */
  modelId: 'Xenova/donut-base-finetuned-docvqa',
  /** Approximate model size for display */
  modelSize: '~800MB',
} as const;

/** Storage keys for persistence */
export const STORAGE_KEYS = {
  /** Document QA store persistence key */
  documentQA: 'invoice-qa-storage',
} as const;

/** Accepted image file types for document upload */
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Example questions for the placeholder */
export const EXAMPLE_QUESTIONS = [
  'What is the total amount?',
  'What is the invoice number?',
  'Who is the sender?',
  'What is the date?',
  'What is the billing address?',
] as const;
