/**
 * @file utils.ts
 * @description Utility functions for the duplicate-finder application
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { PhotoEntry, DuplicateGroup } from './types';

/**
 * Merges Tailwind CSS classes with proper precedence
 * @param inputs - Class values to merge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Compute cosine similarity between two vectors
 * @param a - First vector
 * @param b - Second vector
 * @returns Similarity score between -1 and 1
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
  if (magnitude === 0) return 0;

  return dot / magnitude;
}

/**
 * Group photos into duplicate clusters using union-find and pairwise similarity.
 * Photos with similarity above the threshold are grouped together.
 *
 * @param photos - Photos with embeddings to compare
 * @param threshold - Similarity threshold for grouping (0-1)
 * @returns Array of duplicate groups (only groups with 2+ photos)
 */
export function groupDuplicates(photos: PhotoEntry[], threshold: number): DuplicateGroup[] {
  // Filter to only photos with embeddings
  const embedded = photos.filter((p) => p.embedding !== null);
  if (embedded.length < 2) return [];

  // Union-Find data structure
  const parent = new Map<string, string>();
  const rank = new Map<string, number>();

  // Track pairwise similarities for group score
  const pairSimilarities = new Map<string, number[]>();

  // Initialize union-find
  for (const photo of embedded) {
    parent.set(photo.id, photo.id);
    rank.set(photo.id, 0);
    pairSimilarities.set(photo.id, []);
  }

  /** Find root with path compression */
  function find(id: string): string {
    const p = parent.get(id)!;
    if (p !== id) {
      const root = find(p);
      parent.set(id, root);
      return root;
    }
    return id;
  }

  /** Union by rank */
  function union(a: string, b: string) {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return;

    const rankA = rank.get(rootA)!;
    const rankB = rank.get(rootB)!;

    if (rankA < rankB) {
      parent.set(rootA, rootB);
    } else if (rankA > rankB) {
      parent.set(rootB, rootA);
    } else {
      parent.set(rootB, rootA);
      rank.set(rootA, rankA + 1);
    }
  }

  // Pairwise comparison
  for (let i = 0; i < embedded.length; i++) {
    for (let j = i + 1; j < embedded.length; j++) {
      const similarity = cosineSimilarity(embedded[i].embedding!, embedded[j].embedding!);
      if (similarity >= threshold) {
        union(embedded[i].id, embedded[j].id);
        pairSimilarities.get(embedded[i].id)!.push(similarity);
        pairSimilarities.get(embedded[j].id)!.push(similarity);
      }
    }
  }

  // Collect groups by root
  const groups = new Map<string, PhotoEntry[]>();
  for (const photo of embedded) {
    const root = find(photo.id);
    if (!groups.has(root)) {
      groups.set(root, []);
    }
    groups.get(root)!.push(photo);
  }

  // Build DuplicateGroup array (only groups with 2+ members)
  const result: DuplicateGroup[] = [];
  for (const [, members] of groups) {
    if (members.length < 2) continue;

    // Calculate average similarity across all pairs in the group
    const allSims: number[] = [];
    for (const member of members) {
      allSims.push(...pairSimilarities.get(member.id)!);
    }
    const avgSimilarity = allSims.length > 0
      ? allSims.reduce((sum, s) => sum + s, 0) / allSims.length
      : 0;

    result.push({
      photos: members,
      similarity: avgSimilarity,
    });
  }

  // Sort by highest similarity first
  result.sort((a, b) => b.similarity - a.similarity);

  return result;
}

/**
 * Format a file size in bytes to a human-readable string
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Toggle an ID in a Set (add if missing, remove if present)
 * @param set - Current set of IDs
 * @param id - ID to toggle
 * @returns New set with the ID toggled
 */
export function toggleInSet(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

/**
 * Select all duplicate photo IDs (keeps one per group — the first)
 * @param groups - Duplicate groups
 * @returns Set of IDs to select
 */
export function selectAllDuplicateIds(groups: DuplicateGroup[]): Set<string> {
  const ids = new Set<string>();
  for (const group of groups) {
    for (let i = 1; i < group.photos.length; i++) {
      ids.add(group.photos[i].id);
    }
  }
  return ids;
}

/**
 * Count the number of photos that appear in any duplicate group
 * @param groups - Duplicate groups
 * @returns Number of photos in duplicate groups
 */
export function getDuplicateCount(groups: DuplicateGroup[]): number {
  const ids = new Set<string>();
  for (const group of groups) {
    for (const photo of group.photos) {
      ids.add(photo.id);
    }
  }
  return ids.size;
}

/**
 * Count the number of unique (non-duplicate) photos
 * @param totalPhotos - Total number of photos
 * @param groups - Duplicate groups
 * @returns Number of unique photos
 */
export function getUniqueCount(totalPhotos: number, groups: DuplicateGroup[]): number {
  return totalPhotos - getDuplicateCount(groups);
}

/**
 * Remove photos by IDs from a photos array and update duplicate groups
 * @param photos - Current photos array
 * @param groups - Current duplicate groups
 * @param ids - IDs to remove
 * @returns Updated { photos, groups }
 */
export function removePhotosById(
  photos: PhotoEntry[],
  groups: DuplicateGroup[],
  ids: Set<string>
) {
  return {
    photos: photos.filter((p) => !ids.has(p.id)),
    groups: groups
      .map((group) => ({
        ...group,
        photos: group.photos.filter((p) => !ids.has(p.id)),
      }))
      .filter((group) => group.photos.length >= 2),
  };
}
