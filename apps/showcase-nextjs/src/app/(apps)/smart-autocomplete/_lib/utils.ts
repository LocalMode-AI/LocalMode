/**
 * @file utils.ts
 * @description Utility functions for the smart autocomplete application
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merges Tailwind CSS classes with proper precedence */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format score as percentage */
export function formatScore(score: number) {
  return `${(score * 100).toFixed(1)}%`;
}

/** Replace [MASK] token with a word */
export function replaceMask(text: string, word: string) {
  return text.replace('[MASK]', word);
}
