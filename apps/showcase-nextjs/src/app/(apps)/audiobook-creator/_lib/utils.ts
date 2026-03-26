/**
 * @file utils.ts
 * @description Utility functions for the audiobook-creator application
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
 * Create a downloadable blob URL from a Blob
 * @param blob - Audio blob
 * @returns Blob URL string
 */
export function createAudioBlobUrl(blob: Blob) {
  return URL.createObjectURL(blob);
}
