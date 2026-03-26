/**
 * @file constants.ts
 * @description Constants for the Smart Writer application
 */
import type { LanguagePair, SummaryType } from './types';

/** Fallback model for summarization */
export const SUMMARIZER_MODEL_ID = 'Xenova/distilbart-cnn-6-6';

/** Summary type options */
export const SUMMARY_TYPES: { value: SummaryType; label: string }[] = [
  { value: 'tl;dr', label: 'TL;DR' },
  { value: 'key-points', label: 'Key Points' },
  { value: 'teaser', label: 'Teaser' },
  { value: 'headline', label: 'Headline' },
];

/** Supported language pairs */
export const LANGUAGE_PAIRS: LanguagePair[] = [
  { source: 'en', sourceName: 'English', target: 'es', targetName: 'Spanish', modelId: 'Xenova/opus-mt-en-es' },
  { source: 'en', sourceName: 'English', target: 'fr', targetName: 'French', modelId: 'Xenova/opus-mt-en-fr' },
  { source: 'en', sourceName: 'English', target: 'de', targetName: 'German', modelId: 'Xenova/opus-mt-en-de' },
  { source: 'en', sourceName: 'English', target: 'it', targetName: 'Italian', modelId: 'Xenova/opus-mt-en-it' },
  { source: 'en', sourceName: 'English', target: 'pt', targetName: 'Portuguese', modelId: 'Xenova/opus-mt-en-pt' },
  { source: 'en', sourceName: 'English', target: 'nl', targetName: 'Dutch', modelId: 'Xenova/opus-mt-en-nl' },
  { source: 'en', sourceName: 'English', target: 'ru', targetName: 'Russian', modelId: 'Xenova/opus-mt-en-ru' },
];

/** Sample text for demo */
export const SAMPLE_TEXT = `Artificial intelligence has transformed how we interact with technology. From voice assistants to recommendation systems, AI is now embedded in everyday tools. Recent advances in on-device AI have made it possible to run sophisticated models directly in web browsers, eliminating the need for cloud APIs and ensuring user data never leaves the device. This shift toward local-first AI represents a fundamental change in how we build privacy-respecting applications.`;
