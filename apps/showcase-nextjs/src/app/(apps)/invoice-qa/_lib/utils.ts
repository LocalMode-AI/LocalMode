/**
 * @file utils.ts
 * @description Utility functions for the invoice-qa application
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind CSS classes with proper precedence
 * @param inputs - Class values to merge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a confidence score as a percentage string
 * @param score - Score between 0 and 1
 */
export function formatScore(score: number) {
  return `${(score * 100).toFixed(1)}%`;
}
