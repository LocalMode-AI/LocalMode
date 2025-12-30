/**
 * Recursive text splitter for chunking documents.
 *
 * Recursively splits text using a hierarchy of separators,
 * starting with the most meaningful (paragraphs, sentences)
 * and falling back to less meaningful ones (words, characters).
 *
 * @packageDocumentation
 */

import type { Chunk, RecursiveChunkOptions } from '../types.js';
import { DEFAULT_CHUNK_OPTIONS, DEFAULT_RECURSIVE_SEPARATORS } from '../types.js';

/**
 * Split text recursively using a hierarchy of separators.
 *
 * @param text - The text to split
 * @param options - Chunking configuration
 * @returns Array of chunks with position metadata
 *
 * @example
 * ```typescript
 * const chunks = recursiveChunk(longText, {
 *   size: 500,
 *   overlap: 50,
 *   separators: ['\n\n', '\n', '. ', ' '],
 * });
 * ```
 */
export function recursiveChunk(text: string, options: RecursiveChunkOptions = {}): Chunk[] {
  const {
    size = DEFAULT_CHUNK_OPTIONS.size,
    overlap = DEFAULT_CHUNK_OPTIONS.overlap,
    minSize = DEFAULT_CHUNK_OPTIONS.minSize,
    trim = DEFAULT_CHUNK_OPTIONS.trim,
    keepSeparators = DEFAULT_CHUNK_OPTIONS.keepSeparators,
    separators = DEFAULT_RECURSIVE_SEPARATORS,
  } = options;

  if (!text || text.length === 0) {
    return [];
  }

  // Preserve paragraph structure by NOT collapsing newlines before splitting
  // Only trim leading/trailing whitespace to preserve internal structure
  const normalizedText = trim ? text.trim() : text;

  if (normalizedText.length === 0) {
    return [];
  }

  // If text is smaller than target size, return as single chunk
  // For small documents, we don't apply minSize filter (that's for merge filtering)
  if (normalizedText.length <= size) {
    return [
      {
        text: normalizedText,
        start: 0,
        end: text.length,
        index: 0,
      },
    ];
  }

  // Split recursively
  const splits = splitRecursive(normalizedText, separators, size, keepSeparators);

  // Merge splits into chunks with overlap
  const chunks = mergeWithOverlap(splits, size, overlap, minSize, trim);

  // Calculate positions and assign indices
  const result = assignPositions(normalizedText, chunks, trim);

  // Safety net: if no chunks created but we have text, create fallback chunks
  if (result.length === 0 && normalizedText.length > 0) {
    return createFallbackChunks(normalizedText, size, overlap);
  }

  return result;
}

/**
 * Create fallback chunks by simply splitting text at size boundaries.
 * Used when the recursive algorithm fails to produce chunks.
 */
function createFallbackChunks(text: string, size: number, overlap: number): Chunk[] {
  const chunks: Chunk[] = [];
  const step = Math.max(size - overlap, 1);

  for (let i = 0; i < text.length; i += step) {
    const chunkText = text.slice(i, i + size).trim();
    if (chunkText.length > 0) {
      chunks.push({
        text: chunkText,
        start: i,
        end: Math.min(i + size, text.length),
        index: chunks.length,
      });
    }
    // Avoid infinite loop if step is 0
    if (step === 0) break;
  }

  return chunks;
}

/**
 * Internal split state tracking position.
 */
interface Split {
  text: string;
  start: number;
}

/**
 * Recursively split text using separators.
 */
function splitRecursive(
  text: string,
  separators: string[],
  targetSize: number,
  keepSeparators: boolean,
  currentStart = 0
): Split[] {
  if (text.length <= targetSize || separators.length === 0) {
    return [{ text, start: currentStart }];
  }

  const separator = separators[0];
  const remainingSeparators = separators.slice(1);

  // Handle empty separator (character-level split)
  if (separator === '') {
    return splitByCharacters(text, targetSize, currentStart);
  }

  const parts = splitBySeparator(text, separator, keepSeparators);

  // If no split occurred, try next separator
  if (parts.length <= 1) {
    return splitRecursive(text, remainingSeparators, targetSize, keepSeparators, currentStart);
  }

  // Calculate starting positions for each part
  const splits: Split[] = [];
  let position = currentStart;

  for (const part of parts) {
    if (part.length <= targetSize) {
      splits.push({ text: part, start: position });
    } else {
      // Recursively split this part
      const subSplits = splitRecursive(
        part,
        remainingSeparators,
        targetSize,
        keepSeparators,
        position
      );
      splits.push(...subSplits);
    }
    position += part.length + (keepSeparators ? 0 : separator.length);
  }

  return splits;
}

/**
 * Split text by a separator.
 */
function splitBySeparator(text: string, separator: string, keepSeparators: boolean): string[] {
  if (keepSeparators) {
    // Keep separators at the end of each split
    const parts: string[] = [];
    let remaining = text;
    let lastIndex = 0;

    while (true) {
      const index = remaining.indexOf(separator, lastIndex);
      if (index === -1) {
        if (lastIndex < remaining.length) {
          parts.push(remaining.slice(lastIndex));
        }
        break;
      }
      parts.push(remaining.slice(lastIndex, index + separator.length));
      lastIndex = index + separator.length;
    }

    return parts;
  }

  return text.split(separator);
}

/**
 * Split by characters as a last resort.
 */
function splitByCharacters(text: string, targetSize: number, currentStart: number): Split[] {
  const splits: Split[] = [];
  let position = 0;

  while (position < text.length) {
    const end = Math.min(position + targetSize, text.length);
    splits.push({
      text: text.slice(position, end),
      start: currentStart + position,
    });
    position = end;
  }

  return splits;
}

/**
 * Merge splits into chunks with overlap.
 */
function mergeWithOverlap(
  splits: Split[],
  targetSize: number,
  overlap: number,
  minSize: number,
  trim: boolean
): string[] {
  if (splits.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  let currentChunk = '';

  for (const split of splits) {
    const text = trim ? split.text.trim() : split.text;

    if (!text) continue;

    // If adding this split would exceed target size
    if (currentChunk.length + text.length + 1 > targetSize && currentChunk.length > 0) {
      // Save current chunk
      chunks.push(currentChunk);

      // Start new chunk with overlap from previous
      if (overlap > 0) {
        const overlapBuffer = getOverlapText(currentChunk, overlap);
        currentChunk = overlapBuffer + (overlapBuffer ? ' ' : '') + text;
      } else {
        currentChunk = text;
      }
    } else {
      // Add to current chunk
      currentChunk += (currentChunk ? ' ' : '') + text;
    }
  }

  // Add final chunk - always add if there's content, regardless of minSize
  // minSize is meant for merging small intermediate chunks, not for rejecting content
  if (currentChunk) {
    const trimmedFinal = trim ? currentChunk.trim() : currentChunk;
    if (trimmedFinal.length > 0) {
      if (trimmedFinal.length < minSize && chunks.length > 0) {
        // Merge small final chunk with previous if it's too small
        chunks[chunks.length - 1] += ' ' + trimmedFinal;
      } else {
        chunks.push(trimmedFinal);
      }
    }
  }

  return chunks;
}

/**
 * Get overlap text from the end of a chunk.
 */
function getOverlapText(chunk: string, overlap: number): string {
  if (chunk.length <= overlap) {
    return chunk;
  }

  // Try to break at a word boundary
  const overlapStart = chunk.length - overlap;
  const wordBreak = chunk.indexOf(' ', overlapStart);

  if (wordBreak !== -1 && wordBreak < chunk.length) {
    return chunk.slice(wordBreak + 1);
  }

  return chunk.slice(overlapStart);
}

/**
 * Normalize whitespace within a chunk text.
 * Collapses multiple spaces/newlines to single space while preserving readability.
 */
function normalizeChunkText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Assign positions to chunks by finding them in the original text.
 */
function assignPositions(originalText: string, chunks: string[], trim: boolean): Chunk[] {
  const result: Chunk[] = [];
  let searchStart = 0;

  for (let i = 0; i < chunks.length; i++) {
    // Normalize whitespace within each chunk for clean output
    const chunkText = trim ? normalizeChunkText(chunks[i]) : chunks[i];

    // Find the chunk in the original text
    // First try to find exact match
    let start = findChunkPosition(originalText, chunkText, searchStart);

    // If not found, try finding the first part of the chunk
    if (start === -1) {
      const firstPart = chunkText.slice(0, Math.min(50, chunkText.length));
      start = findChunkPosition(originalText, firstPart, searchStart);
    }

    // If still not found, use estimated position
    if (start === -1) {
      start = searchStart;
    }

    const end = Math.min(start + chunkText.length, originalText.length);

    result.push({
      text: chunkText,
      start,
      end,
      index: i,
    });

    // Move search start forward, accounting for overlap
    searchStart = Math.max(start + 1, end - chunkText.length / 2);
  }

  return result;
}

/**
 * Find the position of a chunk in the original text.
 */
function findChunkPosition(text: string, chunk: string, startFrom: number): number {
  // First try exact match
  let pos = text.indexOf(chunk, startFrom);
  if (pos !== -1) {
    return pos;
  }

  // Try normalized match (collapse whitespace)
  const normalizedChunk = chunk.replace(/\s+/g, ' ').trim();
  const normalizedText = text.slice(startFrom).replace(/\s+/g, ' ');
  pos = normalizedText.indexOf(normalizedChunk);

  if (pos !== -1) {
    // Map back to original position (approximate)
    return startFrom + pos;
  }

  return -1;
}

/**
 * Create a recursive chunker function with preset options.
 */
export function createRecursiveChunker(
  defaultOptions: RecursiveChunkOptions = {}
): (text: string, options?: RecursiveChunkOptions) => Chunk[] {
  return (text: string, options: RecursiveChunkOptions = {}) =>
    recursiveChunk(text, { ...defaultOptions, ...options });
}
