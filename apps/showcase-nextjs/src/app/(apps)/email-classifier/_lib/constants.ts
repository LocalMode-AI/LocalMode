/**
 * @file constants.ts
 * @description Constants for the email classifier application
 */

/** Model ID for zero-shot classification */
export const MODEL_ID = 'Xenova/mobilebert-uncased-mnli';

/** Approximate model download size */
export const MODEL_SIZE = '~25MB';

/** Default classification categories */
export const DEFAULT_CATEGORIES = ['Support', 'Sales', 'Billing', 'Spam', 'General Inquiry'];

/** Sample emails for quick testing */
export const SAMPLE_EMAILS = [
  'I cannot log into my account. I have tried resetting my password multiple times but keep getting an error.',
  'We are interested in your enterprise plan. Can we schedule a demo for our team of 50 people?',
  'I was charged twice for my subscription this month. Please process a refund immediately.',
  'CONGRATULATIONS! You have won a $1000 gift card! Click here to claim your prize now!!!',
  'When will the new version be released? We are excited about the upcoming features.',
];
