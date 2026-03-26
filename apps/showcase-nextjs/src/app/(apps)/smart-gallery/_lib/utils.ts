/**
 * @file utils.ts
 * @description Utility functions for the smart gallery application
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
 * Get a badge color class based on category name
 * @param category - The category label
 */
export function getCategoryColor(category: string) {
  const colors: Record<string, string> = {
    nature: 'badge-success',
    people: 'badge-info',
    animals: 'badge-warning',
    food: 'badge-error',
    architecture: 'badge-primary',
    vehicles: 'badge-secondary',
    art: 'badge-accent',
    technology: 'badge-info',
    sports: 'badge-warning',
    other: 'badge-ghost',
  };
  return colors[category] ?? 'badge-ghost';
}

/**
 * Get color class for a score badge based on similarity threshold
 * @param score - Similarity score (0-1)
 */
export function getScoreColor(score: number) {
  if (score >= 0.7) return 'badge-success';
  if (score >= 0.4) return 'badge-warning';
  return 'badge-ghost';
}

/**
 * Extract unique, sorted categories from gallery photos
 * @param photos - Gallery photos array
 * @returns Sorted array of category strings
 */
export function getCategories(photos: { isProcessing: boolean; category: string }[]) {
  const categories = new Set(
    photos
      .filter((p) => !p.isProcessing && p.category)
      .map((p) => p.category)
  );
  return Array.from(categories).sort();
}
