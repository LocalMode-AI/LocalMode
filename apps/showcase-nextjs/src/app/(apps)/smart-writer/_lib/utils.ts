/**
 * @file utils.ts
 * @description Utility functions for the Smart Writer application
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

/** Format milliseconds as human-readable duration */
export function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
