/**
 * Format Detection
 *
 * Auto-detect external vector database format from content structure.
 * Uses content sniffing rather than file extensions for reliability.
 *
 * @packageDocumentation
 */

import { ParseError } from '../errors/index.js';
import type { ExternalFormat } from './types.js';

/**
 * Detect the external format of vector data from its content.
 *
 * Detection order:
 * 1. Try JSON parse — if `vectors` array with `values` fields -> Pinecone
 * 2. Try JSON parse — if `ids` and (`embeddings` or `documents`) -> ChromaDB
 * 3. If multiple lines where each non-empty line is valid JSON -> JSONL
 * 4. If first line has comma-separated values -> CSV
 * 5. Otherwise -> throw ParseError
 *
 * @param content - Raw content string to analyze
 * @returns Detected format
 * @throws {ParseError} When format cannot be determined
 *
 * @example
 * ```ts
 * import { detectFormat } from '@localmode/core';
 *
 * const format = detectFormat(fileContent);
 * // 'pinecone' | 'chroma' | 'csv' | 'jsonl'
 * ```
 */
export function detectFormat(content: string): ExternalFormat {
  const trimmed = content.trim();

  if (!trimmed) {
    throw new ParseError('Content is empty', {
      hint: 'Provide non-empty content in a supported format: Pinecone JSON, ChromaDB JSON, CSV, or JSONL.',
    });
  }

  // Try JSON parsing first
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);

      // Check for Pinecone format: { vectors: [{ id, values, ... }] }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        if (Array.isArray(parsed.vectors) && parsed.vectors.length > 0) {
          const first = parsed.vectors[0];
          if (first && ('values' in first || 'id' in first)) {
            return 'pinecone';
          }
        }

        // Check for ChromaDB format: { ids: [], embeddings?: [], documents?: [] }
        if (Array.isArray(parsed.ids) && (Array.isArray(parsed.embeddings) || parsed.embeddings === null || Array.isArray(parsed.documents))) {
          return 'chroma';
        }
      }

      // Check for Pinecone flat array: [{ id, values, ... }]
      if (Array.isArray(parsed) && parsed.length > 0) {
        const first = parsed[0];
        if (first && typeof first === 'object' && ('values' in first || ('id' in first && 'metadata' in first))) {
          return 'pinecone';
        }
      }

      // It's valid JSON but not a recognized format — could still be a single-line JSONL
      // Fall through to JSONL detection
    } catch {
      // Not valid JSON as a whole — check for JSONL
    }
  }

  // Check for JSONL: multiple lines where each non-empty line is valid JSON
  const lines = trimmed.split('\n');
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);

  if (nonEmptyLines.length >= 1) {
    let allJSON = true;
    const sampleSize = Math.min(nonEmptyLines.length, 5);

    for (let i = 0; i < sampleSize; i++) {
      try {
        const parsed = JSON.parse(nonEmptyLines[i].trim());
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          allJSON = false;
          break;
        }
      } catch {
        allJSON = false;
        break;
      }
    }

    if (allJSON && nonEmptyLines.length > 1) {
      return 'jsonl';
    }

    // Single-line JSON object that didn't match Pinecone/ChromaDB
    // could be a single JSONL line
    if (allJSON && nonEmptyLines.length === 1) {
      // If it looks like a record with vector/embedding fields, treat as JSONL
      try {
        const parsed = JSON.parse(nonEmptyLines[0].trim());
        if (parsed && ('vector' in parsed || 'embedding' in parsed || 'values' in parsed || 'id' in parsed)) {
          return 'jsonl';
        }
      } catch {
        // Fall through
      }
    }
  }

  // Check for CSV: first line has comma-separated values
  if (nonEmptyLines.length >= 2) {
    const firstLine = nonEmptyLines[0].trim();
    const commaCount = (firstLine.match(/,/g) || []).length;
    if (commaCount >= 1) {
      // Check that second line has similar structure
      const secondLine = nonEmptyLines[1].trim();
      const secondCommaCount = (secondLine.match(/,/g) || []).length;
      // Allow some variance for quoted fields
      if (secondCommaCount >= 1) {
        return 'csv';
      }
    }
  }

  throw new ParseError(
    'Unable to detect format from content structure',
    {
      hint: 'Supported formats: Pinecone JSON ({ vectors: [...] }), ChromaDB JSON ({ ids: [], embeddings: [] }), CSV (with header row), JSONL (one JSON object per line). Specify the format explicitly if auto-detection fails.',
    }
  );
}
