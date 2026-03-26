/**
 * @file utils.ts
 * @description Utility functions for the LangChain RAG application
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merges Tailwind CSS classes with proper precedence */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a similarity score as a percentage string */
export function formatScore(score: number) {
  return `${(score * 100).toFixed(1)}%`;
}

/**
 * Convert a byte count to a human-readable string.
 * Uses appropriate units (B, KB, MB, GB) based on magnitude.
 * Values >= 1 KB are rounded to one decimal place.
 *
 * @param bytes - The byte count to format
 * @returns Human-readable string (e.g., "512 B", "15.0 KB", "3.7 MB")
 */
export function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let value = bytes;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  if (unitIndex === 0) return `${Math.round(value)} B`;
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Split text into overlapping chunks for ingestion.
 * Splits on paragraph boundaries where possible, falling back to character-level splitting.
 *
 * @param text - The full text to split
 * @param chunkSize - Maximum chunk size in characters
 * @param overlap - Number of overlapping characters between chunks
 * @returns Array of text chunks
 */
export function splitTextIntoChunks(text: string, chunkSize: number, overlap: number) {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= chunkSize) return [trimmed];

  const chunks: string[] = [];
  let start = 0;

  while (start < trimmed.length) {
    let end = Math.min(start + chunkSize, trimmed.length);

    // Try to break at a paragraph or sentence boundary
    if (end < trimmed.length) {
      const segment = trimmed.slice(start, end);
      const lastParagraph = segment.lastIndexOf('\n\n');
      const lastSentence = segment.lastIndexOf('. ');

      if (lastParagraph > chunkSize * 0.3) {
        end = start + lastParagraph + 2;
      } else if (lastSentence > chunkSize * 0.3) {
        end = start + lastSentence + 2;
      }
    }

    chunks.push(trimmed.slice(start, end).trim());

    // Move forward by (chunkLength - overlap), but ensure we always advance
    const advance = end - overlap;
    if (advance <= start) break; // overlap >= chunk produced — stop
    start = advance;
  }

  return chunks.filter((c) => c.length > 0);
}
