/**
 * ChromaDB JSON Parser
 *
 * Parses ChromaDB's columnar JSON export format into ImportRecord[].
 * Handles the parallel arrays structure: { ids, embeddings, metadatas, documents }.
 *
 * @packageDocumentation
 */

import { ParseError } from '../../errors/index.js';
import type { ImportRecord } from '../types.js';

/**
 * Parse ChromaDB columnar JSON export data into ImportRecord[].
 *
 * ChromaDB exports data as parallel arrays:
 * ```json
 * {
 *   "ids": ["d1", "d2"],
 *   "embeddings": [[0.1, 0.2], [0.3, 0.4]],
 *   "metadatas": [{"k": "v1"}, {"k": "v2"}],
 *   "documents": ["text1", "text2"]
 * }
 * ```
 *
 * When `embeddings` is `null` or missing, all records are text-only.
 *
 * @param content - Raw JSON string in ChromaDB format
 * @returns Array of parsed ImportRecord objects
 * @throws {ParseError} On invalid JSON, missing ids, or mismatched array lengths
 *
 * @example
 * ```ts
 * import { parseChroma } from '@localmode/core';
 *
 * const records = parseChroma('{"ids": ["d1"], "embeddings": [[0.1, 0.2]], "documents": ["hello"]}');
 * // [{ id: 'd1', vector: Float32Array([0.1, 0.2]), text: 'hello' }]
 * ```
 */
export function parseChroma(content: string): ImportRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (cause) {
    throw new ParseError(
      'Failed to parse ChromaDB JSON: invalid JSON',
      {
        hint: 'Ensure the content is valid JSON. ChromaDB exports use the format: { "ids": [...], "embeddings": [...], "metadatas": [...], "documents": [...] }',
        context: { format: 'chroma' },
        cause: cause instanceof Error ? cause : undefined,
      }
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ParseError(
      'ChromaDB JSON must be an object with "ids" array',
      {
        hint: 'Expected format: { "ids": [...], "embeddings": [...], "metadatas": [...], "documents": [...] }',
        context: { format: 'chroma' },
      }
    );
  }

  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.ids)) {
    throw new ParseError(
      'ChromaDB JSON: "ids" field must be an array',
      {
        hint: 'The "ids" field is required and must be an array of string identifiers.',
        context: { format: 'chroma' },
      }
    );
  }

  const ids = obj.ids as unknown[];
  const count = ids.length;

  // Validate embeddings array length if present
  const embeddings = Array.isArray(obj.embeddings) ? obj.embeddings as unknown[][] : null;
  if (embeddings && embeddings.length !== count) {
    throw new ParseError(
      `ChromaDB JSON: "embeddings" array length (${embeddings.length}) does not match "ids" array length (${count})`,
      {
        hint: 'All parallel arrays (ids, embeddings, metadatas, documents) must have the same length.',
        context: { format: 'chroma' },
      }
    );
  }

  // Validate metadatas array length if present
  const metadatas = Array.isArray(obj.metadatas) ? obj.metadatas as Record<string, unknown>[] : null;
  if (metadatas && metadatas.length !== count) {
    throw new ParseError(
      `ChromaDB JSON: "metadatas" array length (${metadatas.length}) does not match "ids" array length (${count})`,
      {
        hint: 'All parallel arrays (ids, embeddings, metadatas, documents) must have the same length.',
        context: { format: 'chroma' },
      }
    );
  }

  // Validate documents array length if present
  const documents = Array.isArray(obj.documents) ? obj.documents as (string | null)[] : null;
  if (documents && documents.length !== count) {
    throw new ParseError(
      `ChromaDB JSON: "documents" array length (${documents.length}) does not match "ids" array length (${count})`,
      {
        hint: 'All parallel arrays (ids, embeddings, metadatas, documents) must have the same length.',
        context: { format: 'chroma' },
      }
    );
  }

  const records: ImportRecord[] = [];

  for (let i = 0; i < count; i++) {
    const record: ImportRecord = {
      id: String(ids[i]),
    };

    // Extract embedding
    if (embeddings && Array.isArray(embeddings[i])) {
      record.vector = new Float32Array(embeddings[i] as number[]);
    }

    // Extract document text
    if (documents && documents[i] != null) {
      record.text = String(documents[i]);
    }

    // Extract metadata
    if (metadatas && metadatas[i] && typeof metadatas[i] === 'object') {
      record.metadata = { ...metadatas[i] };
    }

    records.push(record);
  }

  return records;
}
