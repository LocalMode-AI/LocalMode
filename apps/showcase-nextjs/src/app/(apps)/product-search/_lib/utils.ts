/**
 * @file utils.ts
 * @description Utility functions for the product search application
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
 * Format a similarity score as a percentage string
 * @param score - Similarity score (0-1)
 */
export function formatScore(score: number) {
  return `${Math.round(score * 100)}%`;
}

/**
 * Filter products by category
 * @param products - Array of products
 * @param category - Category to filter by, or null for all
 * @returns Filtered products array
 */
export function getFilteredProducts<T extends { category: string }>(
  products: T[],
  category: string | null
) {
  if (!category) return products;
  return products.filter((p) => p.category === category);
}

/**
 * Count products per category
 * @param products - Array of products
 * @returns Record mapping category to count
 */
export function getCategoryCounts(products: { category: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const product of products) {
    counts[product.category] = (counts[product.category] || 0) + 1;
  }
  return counts;
}

/**
 * Format a device profile into a human-readable summary string
 * @param profile - Device profile from computeOptimalBatchSize()
 * @returns Human-readable summary (e.g., "8 cores, 16GB RAM, GPU: Yes")
 */
export function formatDeviceProfile(profile: {
  cores: number;
  memoryGB: number;
  hasGPU: boolean;
  source: string;
}) {
  return `${profile.cores} cores, ${profile.memoryGB}GB RAM, GPU: ${profile.hasGPU ? 'Yes' : 'No'}`;
}
