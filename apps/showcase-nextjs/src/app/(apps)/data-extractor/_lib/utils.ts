/**
 * @file utils.ts
 * @description Utility functions for the data extractor application
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merges Tailwind CSS classes with proper precedence */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format token count for display */
export function formatTokens(tokens: number) {
  return tokens.toLocaleString();
}

/** Format duration in milliseconds for display */
export function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
