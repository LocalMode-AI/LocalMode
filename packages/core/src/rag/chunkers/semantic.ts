/**
 * Semantic (embedding-aware) text chunking.
 *
 * Splits text at points where embedding similarity between adjacent
 * segments drops, producing topically coherent chunks. Uses the
 * recursive chunker for initial sentence splitting and cosine
 * similarity between segment embeddings for breakpoint detection.
 *
 * @packageDocumentation
 */

import type { Chunk, SemanticChunkOptions } from '../types.js';
import { recursiveChunk } from './recursive.js';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

/** Default separators for initial sentence splitting */
const DEFAULT_SENTENCE_SEPARATORS = ['\n\n', '\n', '. ', '? ', '! ', '; '];

/** Default target size for initial sentence segments (characters) */
const DEFAULT_SEGMENT_SIZE = 200;

/** Default maximum chunk size (characters) */
const DEFAULT_MAX_CHUNK_SIZE = 2000;

/** Default minimum chunk size (characters) */
const DEFAULT_MIN_CHUNK_SIZE = 100;

// ═══════════════════════════════════════════════════════════════
// INTERNAL UTILITIES
// ═══════════════════════════════════════════════════════════════

/**
 * Compute the cosine similarity between two Float32Array vectors.
 *
 * Returns `dot(a, b) / (magnitude(a) * magnitude(b))`.
 * Returns 0 when either vector has zero magnitude (avoids division by zero).
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity in the range [-1, 1], or 0 for zero vectors
 *
 * @internal Exported for testing only
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

  if (magnitude === 0) {
    return 0;
  }

  return dot / magnitude;
}

/**
 * Compute the auto-threshold from a distribution of similarity scores.
 *
 * Uses `mean - stddev` for arrays of length >= 2.
 * For single-element arrays, returns `value - 0.01` (no meaningful stddev).
 *
 * @param similarities - Array of cosine similarity scores
 * @returns Threshold value below which similarities indicate topic shifts
 *
 * @internal Exported for testing only
 */
export function autoThreshold(similarities: number[]): number {
  if (similarities.length === 0) {
    return 0;
  }

  if (similarities.length === 1) {
    return similarities[0] - 0.01;
  }

  const mean = similarities.reduce((sum, s) => sum + s, 0) / similarities.length;

  const variance =
    similarities.reduce((sum, s) => sum + (s - mean) * (s - mean), 0) / similarities.length;
  const stddev = Math.sqrt(variance);

  return mean - stddev;
}

// ═══════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Split text into chunks at embedding-based topic boundaries.
 *
 * The algorithm:
 * 1. Pre-splits text into sentence-level segments using the recursive chunker
 * 2. Embeds all segments using `embedMany()` with the provided model
 * 3. Computes cosine similarity between adjacent segment embeddings
 * 4. Identifies breakpoints where similarity falls below the threshold
 * 5. Merges consecutive non-break segments into output chunks
 * 6. Enforces size constraints (maxChunkSize, minChunkSize)
 * 7. Returns chunks with position metadata and semantic boundary scores
 *
 * @param options - Semantic chunking configuration
 * @returns Promise resolving to an array of chunks with semantic metadata
 *
 * @example
 * ```ts
 * import { semanticChunk } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const model = transformers.embedding('Xenova/bge-small-en-v1.5');
 *
 * const chunks = await semanticChunk({
 *   text: longDocument,
 *   model,
 *   size: 1000,
 * });
 *
 * chunks.forEach((c) => {
 *   console.log(c.text.substring(0, 50));
 *   console.log(c.metadata?.semanticBoundaries);
 * });
 * ```
 *
 * @throws {Error} If aborted via AbortSignal
 *
 * @see {@link createSemanticChunker} for a reusable factory
 * @see {@link recursiveChunk} for synchronous chunking
 */
export async function semanticChunk(options: SemanticChunkOptions): Promise<Chunk[]> {
  const {
    text,
    model,
    threshold,
    size: maxChunkSize = DEFAULT_MAX_CHUNK_SIZE,
    minSize: minChunkSize = DEFAULT_MIN_CHUNK_SIZE,
    segmentSize = DEFAULT_SEGMENT_SIZE,
    sentenceSeparators = DEFAULT_SENTENCE_SEPARATORS,
    abortSignal,
  } = options;

  // Early return for empty text
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Check for cancellation before starting
  abortSignal?.throwIfAborted();

  // ── Step 1: Pre-split into sentence-level segments ──────────
  const segments = recursiveChunk(text, {
    size: segmentSize,
    overlap: 0,
    separators: sentenceSeparators,
    minSize: 1,
    trim: true,
  });

  // If only one segment or none, return as single chunk
  if (segments.length === 0) {
    return [];
  }

  if (segments.length === 1) {
    return [
      {
        text: segments[0].text,
        start: segments[0].start,
        end: segments[0].end,
        index: 0,
        metadata: {
          semanticBoundaries: {
            leftSimilarity: null,
            rightSimilarity: null,
          },
        },
      },
    ];
  }

  // Check for cancellation before embedding
  abortSignal?.throwIfAborted();

  // ── Step 2: Embed all segments ──────────────────────────────
  const { embedMany } = await import('../../embeddings/embed.js');
  const segmentTexts = segments.map((s) => s.text);
  const { embeddings } = await embedMany({
    model,
    values: segmentTexts,
    abortSignal,
  });

  // Check for cancellation before merge phase
  abortSignal?.throwIfAborted();

  // ── Step 3: Compute adjacent cosine similarities ────────────
  const similarities: number[] = [];
  for (let i = 0; i < embeddings.length - 1; i++) {
    similarities.push(cosineSimilarity(embeddings[i], embeddings[i + 1]));
  }

  // ── Step 4: Determine threshold ─────────────────────────────
  const effectiveThreshold = threshold ?? autoThreshold(similarities);

  // ── Step 5: Identify breakpoints ────────────────────────────
  // breakpoints[i] === true means there is a break AFTER segment i
  const breakpoints: boolean[] = [];
  for (let i = 0; i < similarities.length; i++) {
    breakpoints.push(similarities[i] < effectiveThreshold);
  }

  // ── Step 6: Merge segments between breakpoints into groups ──
  interface SegmentGroup {
    segmentIndices: number[];
    text: string;
    start: number;
    end: number;
    /** Internal similarities between adjacent segments within this group */
    internalSimilarities: number[];
  }

  const groups: SegmentGroup[] = [];
  let currentGroup: SegmentGroup = {
    segmentIndices: [0],
    text: segments[0].text,
    start: segments[0].start,
    end: segments[0].end,
    internalSimilarities: [],
  };

  for (let i = 1; i < segments.length; i++) {
    if (breakpoints[i - 1]) {
      // Start a new group
      groups.push(currentGroup);
      currentGroup = {
        segmentIndices: [i],
        text: segments[i].text,
        start: segments[i].start,
        end: segments[i].end,
        internalSimilarities: [],
      };
    } else {
      // Continue current group
      currentGroup.segmentIndices.push(i);
      currentGroup.text += ' ' + segments[i].text;
      currentGroup.end = segments[i].end;
      currentGroup.internalSimilarities.push(similarities[i - 1]);
    }
  }
  groups.push(currentGroup);

  // ── Step 7: Enforce maxChunkSize ────────────────────────────
  const sizedGroups: SegmentGroup[] = [];

  for (const group of groups) {
    if (group.text.length <= maxChunkSize || group.segmentIndices.length <= 1) {
      sizedGroups.push(group);
    } else {
      // Split at the lowest-similarity internal boundary
      const subGroups = splitGroupAtLowestSimilarity(
        group,
        segments,
        similarities,
        maxChunkSize
      );
      sizedGroups.push(...subGroups);
    }
  }

  // ── Step 8: Enforce minChunkSize ────────────────────────────
  const mergedGroups = mergeSmallGroups(sizedGroups, segments, similarities, minChunkSize);

  // ── Step 9: Compute boundary similarities between final chunks ──
  // The boundary similarity between chunk i and chunk i+1 is the cosine
  // similarity between the last segment of chunk i and the first segment of chunk i+1
  const chunkBoundarySimilarities: number[] = [];
  for (let i = 0; i < mergedGroups.length - 1; i++) {
    const lastSegIdx = mergedGroups[i].segmentIndices[mergedGroups[i].segmentIndices.length - 1];
    const firstSegIdx = mergedGroups[i + 1].segmentIndices[0];

    // If segments are adjacent, use pre-computed similarity
    if (firstSegIdx === lastSegIdx + 1) {
      chunkBoundarySimilarities.push(similarities[lastSegIdx]);
    } else {
      // Non-adjacent (shouldn't happen, but compute directly)
      chunkBoundarySimilarities.push(
        cosineSimilarity(embeddings[lastSegIdx], embeddings[firstSegIdx])
      );
    }
  }

  // ── Step 10: Build final Chunk[] with metadata ──────────────
  const result: Chunk[] = mergedGroups.map((group, index) => ({
    text: group.text,
    start: group.start,
    end: group.end,
    index,
    metadata: {
      semanticBoundaries: {
        leftSimilarity: index > 0 ? chunkBoundarySimilarities[index - 1] : null,
        rightSimilarity:
          index < mergedGroups.length - 1 ? chunkBoundarySimilarities[index] : null,
      },
    },
  }));

  return result;
}

// ═══════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Recursively split a segment group at the lowest-similarity internal
 * boundary until all sub-groups are within maxChunkSize.
 */
function splitGroupAtLowestSimilarity(
  group: { segmentIndices: number[]; text: string; start: number; end: number; internalSimilarities: number[] },
  segments: Chunk[],
  allSimilarities: number[],
  maxChunkSize: number
): Array<{ segmentIndices: number[]; text: string; start: number; end: number; internalSimilarities: number[] }> {
  if (group.text.length <= maxChunkSize || group.segmentIndices.length <= 1) {
    return [group];
  }

  // Find the internal boundary with the lowest similarity
  let lowestIdx = 0;
  let lowestSim = Infinity;

  for (let i = 0; i < group.internalSimilarities.length; i++) {
    if (group.internalSimilarities[i] < lowestSim) {
      lowestSim = group.internalSimilarities[i];
      lowestIdx = i;
    }
  }

  // Split at lowestIdx + 1 (the segment index within the group)
  const splitAt = lowestIdx + 1;
  const leftIndices = group.segmentIndices.slice(0, splitAt);
  const rightIndices = group.segmentIndices.slice(splitAt);

  const buildGroup = (indices: number[]) => {
    const text = indices.map((i) => segments[i].text).join(' ');
    const intSim: number[] = [];
    for (let i = 0; i < indices.length - 1; i++) {
      const segIdx = indices[i];
      if (segIdx < allSimilarities.length) {
        intSim.push(allSimilarities[segIdx]);
      }
    }
    return {
      segmentIndices: indices,
      text,
      start: segments[indices[0]].start,
      end: segments[indices[indices.length - 1]].end,
      internalSimilarities: intSim,
    };
  };

  const leftGroup = buildGroup(leftIndices);
  const rightGroup = buildGroup(rightIndices);

  // Recursively split if still too large
  return [
    ...splitGroupAtLowestSimilarity(leftGroup, segments, allSimilarities, maxChunkSize),
    ...splitGroupAtLowestSimilarity(rightGroup, segments, allSimilarities, maxChunkSize),
  ];
}

/**
 * Merge groups that are below minChunkSize with their highest-similarity neighbor.
 */
function mergeSmallGroups(
  groups: Array<{ segmentIndices: number[]; text: string; start: number; end: number; internalSimilarities: number[] }>,
  segments: Chunk[],
  allSimilarities: number[],
  minChunkSize: number
): Array<{ segmentIndices: number[]; text: string; start: number; end: number; internalSimilarities: number[] }> {
  if (groups.length <= 1) {
    return groups;
  }

  const result = [...groups];
  let changed = true;

  while (changed) {
    changed = false;

    for (let i = 0; i < result.length; i++) {
      if (result[i].text.length >= minChunkSize) {
        continue;
      }

      // Find the neighbor with higher boundary similarity
      let mergeWith = -1;

      if (i === 0 && result.length > 1) {
        mergeWith = 1;
      } else if (i === result.length - 1 && result.length > 1) {
        mergeWith = i - 1;
      } else if (result.length > 1) {
        // Compare boundary similarities with left and right neighbors
        const leftLastSeg = result[i - 1].segmentIndices[result[i - 1].segmentIndices.length - 1];
        const rightFirstSeg = result[i + 1].segmentIndices[0];
        const currentFirstSeg = result[i].segmentIndices[0];
        const currentLastSeg = result[i].segmentIndices[result[i].segmentIndices.length - 1];

        const leftSim =
          leftLastSeg < allSimilarities.length && currentFirstSeg === leftLastSeg + 1
            ? allSimilarities[leftLastSeg]
            : 0;
        const rightSim =
          currentLastSeg < allSimilarities.length && rightFirstSeg === currentLastSeg + 1
            ? allSimilarities[currentLastSeg]
            : 0;

        mergeWith = leftSim >= rightSim ? i - 1 : i + 1;
      }

      if (mergeWith === -1) {
        continue;
      }

      // Merge the two groups
      const [first, second] = mergeWith < i ? [mergeWith, i] : [i, mergeWith];
      const merged = {
        segmentIndices: [...result[first].segmentIndices, ...result[second].segmentIndices],
        text: result[first].text + ' ' + result[second].text,
        start: result[first].start,
        end: result[second].end,
        internalSimilarities: [
          ...result[first].internalSimilarities,
          // Add the boundary similarity between the two groups
          ...getBoundarySimilarity(result[first], result[second], segments, allSimilarities),
          ...result[second].internalSimilarities,
        ],
      };

      result.splice(second, 1);
      result[first] = merged;
      changed = true;
      break; // Restart the loop since indices shifted
    }
  }

  return result;
}

/**
 * Get the boundary similarity between two adjacent groups.
 */
function getBoundarySimilarity(
  left: { segmentIndices: number[] },
  right: { segmentIndices: number[] },
  _segments: Chunk[],
  allSimilarities: number[]
): number[] {
  const lastLeft = left.segmentIndices[left.segmentIndices.length - 1];
  const firstRight = right.segmentIndices[0];

  if (firstRight === lastLeft + 1 && lastLeft < allSimilarities.length) {
    return [allSimilarities[lastLeft]];
  }

  return [];
}

// ═══════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════

/**
 * Create a reusable semantic chunker function with preset options.
 *
 * The returned function only requires the text to chunk. Default options
 * can be overridden per call.
 *
 * @param defaultOptions - Default options (model is required, everything else optional)
 * @returns An async function that chunks text using semantic similarity
 *
 * @example
 * ```ts
 * import { createSemanticChunker } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const chunker = createSemanticChunker({
 *   model: transformers.embedding('Xenova/bge-small-en-v1.5'),
 *   threshold: 0.4,
 *   size: 1000,
 * });
 *
 * const chunks1 = await chunker('First document...');
 * const chunks2 = await chunker('Second document...', { threshold: 0.6 });
 * ```
 *
 * @see {@link semanticChunk} for the underlying function
 */
export function createSemanticChunker(
  defaultOptions: Omit<SemanticChunkOptions, 'text'>
): (text: string, overrides?: Partial<Omit<SemanticChunkOptions, 'text' | 'model'>>) => Promise<Chunk[]> {
  return (
    text: string,
    overrides: Partial<Omit<SemanticChunkOptions, 'text' | 'model'>> = {}
  ) =>
    semanticChunk({
      ...defaultOptions,
      ...overrides,
      text,
    });
}
