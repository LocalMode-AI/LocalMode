/**
 * @file constants.ts
 * @description Constants for the translator application
 */
import type { LanguagePair } from './types';

/** Supported language pairs with model IDs */
export const LANGUAGE_PAIRS: LanguagePair[] = [
  { source: 'en', target: 'de', sourceName: 'English', targetName: 'German', modelId: 'Xenova/opus-mt-en-de' },
  { source: 'en', target: 'fr', sourceName: 'English', targetName: 'French', modelId: 'Xenova/opus-mt-en-fr' },
  { source: 'en', target: 'es', sourceName: 'English', targetName: 'Spanish', modelId: 'Xenova/opus-mt-en-es' },
  { source: 'de', target: 'en', sourceName: 'German', targetName: 'English', modelId: 'Xenova/opus-mt-de-en' },
  { source: 'fr', target: 'en', sourceName: 'French', targetName: 'English', modelId: 'Xenova/opus-mt-fr-en' },
  { source: 'es', target: 'en', sourceName: 'Spanish', targetName: 'English', modelId: 'Xenova/opus-mt-es-en' },
];

/** Default language pair index */
export const DEFAULT_PAIR_INDEX = 0;

/** Model size estimate */
export const MODEL_SIZE = '~100MB per pair';
