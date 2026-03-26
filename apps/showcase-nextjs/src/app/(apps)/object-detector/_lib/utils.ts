/**
 * @file utils.ts
 * @description Utility functions for the object-detector application
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { DETECTION_COLORS } from './constants';

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

/**
 * Get a color for a detection based on its index
 * @param index - Detection index
 */
export function getDetectionColor(index: number) {
  return DETECTION_COLORS[index % DETECTION_COLORS.length];
}

/**
 * Get the natural dimensions of an image from its data URL
 * @param dataUrl - Image data URL
 */
export function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}
