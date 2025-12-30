/**
 * Text chunking utilities for RAG pipelines.
 *
 * Provides multiple chunking strategies:
 * - Recursive: General-purpose splitting with configurable separators
 * - Markdown: Structure-aware splitting for markdown documents
 * - Code: Language-aware splitting for source code
 *
 * @packageDocumentation
 */

export { recursiveChunk, createRecursiveChunker } from './recursive.js';
export { markdownChunk, createMarkdownChunker } from './markdown.js';
export { codeChunk, createCodeChunker } from './code.js';

import type {
  Chunk,
  ChunkOptions,
  RecursiveChunkOptions,
  MarkdownChunkOptions,
  CodeChunkOptions,
} from '../types.js';
import { recursiveChunk } from './recursive.js';
import { markdownChunk } from './markdown.js';
import { codeChunk } from './code.js';

/**
 * Split text into chunks using the specified strategy.
 *
 * This is the main entry point for chunking. It automatically routes to the
 * appropriate chunker based on the strategy option.
 *
 * @param text - Text to split into chunks
 * @param options - Chunking options including strategy
 * @returns Array of chunks
 *
 * @example
 * ```typescript
 * import { chunk } from '@localmode/core';
 *
 * // Default recursive chunking
 * const chunks = chunk(longDocument, { size: 500, overlap: 50 });
 *
 * // Markdown-aware chunking
 * const mdChunks = chunk(markdown, {
 *   strategy: 'markdown',
 *   size: 1000,
 *   preserveHeadingHierarchy: true,
 * });
 *
 * // Code-aware chunking
 * const codeChunks = chunk(sourceCode, {
 *   strategy: 'code',
 *   language: 'typescript',
 *   preserveBlocks: true,
 * });
 * ```
 */
export function chunk(text: string, options: ChunkOptions = { strategy: 'recursive' }): Chunk[] {
  const { strategy = 'recursive' } = options;

  switch (strategy) {
    case 'markdown':
      return markdownChunk(text, options as MarkdownChunkOptions);
    case 'code':
      return codeChunk(text, options as CodeChunkOptions);
    case 'recursive':
    case 'sentence':
    case 'paragraph':
    default:
      return recursiveChunk(text, options as RecursiveChunkOptions);
  }
}

/**
 * Create a reusable chunker function with preset options.
 *
 * @param defaultOptions - Default options for the chunker
 * @returns A chunker function that accepts text and optional overrides
 *
 * @example
 * ```typescript
 * import { createChunker } from '@localmode/core';
 *
 * // Create a chunker with preset options
 * const chunker = createChunker({
 *   strategy: 'markdown',
 *   size: 800,
 *   overlap: 100,
 * });
 *
 * // Use the chunker
 * const chunks1 = chunker(document1);
 * const chunks2 = chunker(document2, { size: 500 }); // Override size
 * ```
 */
export function createChunker(
  defaultOptions: ChunkOptions
): (text: string, options?: Partial<ChunkOptions>) => Chunk[] {
  return (text: string, options: Partial<ChunkOptions> = {}) =>
    chunk(text, { ...defaultOptions, ...options } as ChunkOptions);
}

/**
 * Estimate the number of chunks for a given text without actually chunking.
 *
 * @param text - Text to estimate
 * @param options - Chunking options
 * @returns Estimated number of chunks
 *
 * @example
 * ```typescript
 * const estimate = estimateChunkCount(longDocument, { size: 500 });
 * console.log(`Will produce approximately ${estimate} chunks`);
 * ```
 */
export function estimateChunkCount(
  text: string,
  options: ChunkOptions = { strategy: 'recursive' }
): number {
  if (!text || text.length === 0) return 0;

  const { size = 500, overlap = 50 } = options;
  const effectiveSize = size - overlap;

  if (effectiveSize <= 0) return 1;

  return Math.ceil(text.length / effectiveSize);
}

/**
 * Get statistics about chunks.
 *
 * @param chunks - Array of chunks to analyze
 * @returns Statistics about the chunks
 *
 * @example
 * ```typescript
 * const stats = getChunkStats(chunks);
 * console.log(`Average chunk size: ${stats.averageSize} characters`);
 * ```
 */
export function getChunkStats(chunks: Chunk[]): {
  count: number;
  totalSize: number;
  averageSize: number;
  minSize: number;
  maxSize: number;
  sizes: number[];
} {
  if (chunks.length === 0) {
    return {
      count: 0,
      totalSize: 0,
      averageSize: 0,
      minSize: 0,
      maxSize: 0,
      sizes: [],
    };
  }

  const sizes = chunks.map((c) => c.text.length);
  const totalSize = sizes.reduce((a, b) => a + b, 0);

  return {
    count: chunks.length,
    totalSize,
    averageSize: Math.round(totalSize / chunks.length),
    minSize: Math.min(...sizes),
    maxSize: Math.max(...sizes),
    sizes,
  };
}

