/**
 * @file utils.ts
 * @description Utility functions for the QA bot application
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merges Tailwind CSS classes with proper precedence */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formats a confidence score as a percentage string */
export function formatScore(score: number) {
  return `${(score * 100).toFixed(1)}%`;
}
