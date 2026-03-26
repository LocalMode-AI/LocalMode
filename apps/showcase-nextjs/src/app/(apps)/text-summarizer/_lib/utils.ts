/**
 * @file utils.ts
 * @description Utility functions for the text summarizer application
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merges Tailwind CSS classes with proper precedence */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Count words in text */
export function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Calculate compression ratio */
export function compressionRatio(original: string, summary: string) {
  const originalWords = countWords(original);
  const summaryWords = countWords(summary);
  if (originalWords === 0) return 0;
  return Math.round((1 - summaryWords / originalWords) * 100);
}
