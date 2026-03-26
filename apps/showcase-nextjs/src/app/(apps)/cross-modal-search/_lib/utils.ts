/**
 * @file utils.ts
 * @description Utility functions for the cross-modal search application
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
 * Generate a unique photo ID
 * @returns A UUID string
 */
export function generatePhotoId() {
  return crypto.randomUUID();
}

/**
 * Format a similarity score as a percentage string
 * @param score - Similarity score (0-1)
 */
export function formatScore(score: number) {
  return `${Math.round(score * 100)}%`;
}

/**
 * Get color class for a score badge based on similarity threshold.
 * CLIP cross-modal scores are typically lower than same-modality scores,
 * so thresholds are adjusted accordingly.
 * @param score - Similarity score (0-1)
 */
export function getScoreColor(score: number) {
  if (score >= 0.35) return 'badge-success';
  if (score >= 0.2) return 'badge-warning';
  return 'badge-ghost';
}
