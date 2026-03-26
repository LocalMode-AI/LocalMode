/**
 * Pinecone JSON Parser
 *
 * Parses Pinecone's vector export format into ImportRecord[].
 * Handles both `{ vectors: [...] }` wrapper and flat array `[{ id, values, metadata }]`.
 *
 * @packageDocumentation
 */

import { ParseError } from '../../errors/index.js';
import type { ImportRecord } from '../types.js';

/**
 * Parse Pinecone JSON export data into ImportRecord[].
 *
 * Supports two Pinecone export shapes:
 * - Wrapped: `{ vectors: [{ id, values, metadata }] }`
 * - Flat array: `[{ id, values, metadata }]`
 *
 * Records without `values` are treated as text-only — the text is extracted
 * from `metadata.text` or `metadata.content` if available.
 * The `sparse_values` field is ignored (only dense vectors are imported).
 *
 * @param content - Raw JSON string in Pinecone format
 * @returns Array of parsed ImportRecord objects
 * @throws {ParseError} On invalid JSON or unexpected structure
 *
 * @example
 * ```ts
 * import { parsePinecone } from '@localmode/core';
 *
 * const records = parsePinecone('{"vectors": [{"id": "v1", "values": [0.1, 0.2], "metadata": {"title": "Hello"}}]}');
 * // [{ id: 'v1', vector: Float32Array([0.1, 0.2]), metadata: { title: 'Hello' } }]
 * ```
 */
export function parsePinecone(content: string): ImportRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (cause) {
    throw new ParseError(
      'Failed to parse Pinecone JSON: invalid JSON',
      {
        hint: 'Ensure the content is valid JSON. Pinecone exports use the format: { "vectors": [{ "id": "...", "values": [...], "metadata": {...} }] }',
        context: { format: 'pinecone' },
        cause: cause instanceof Error ? cause : undefined,
      }
    );
  }

  // Extract the vectors array
  let vectors: unknown[];

  if (Array.isArray(parsed)) {
    // Flat array format
    vectors = parsed;
  } else if (parsed && typeof parsed === 'object' && 'vectors' in parsed) {
    const obj = parsed as Record<string, unknown>;
    if (!Array.isArray(obj.vectors)) {
      throw new ParseError(
        'Pinecone JSON: "vectors" field must be an array',
        {
          hint: 'The "vectors" field should be an array of objects with "id", "values", and optional "metadata" fields.',
          context: { format: 'pinecone' },
        }
      );
    }
    vectors = obj.vectors;
  } else {
    throw new ParseError(
      'Unrecognized Pinecone JSON structure',
      {
        hint: 'Expected either { "vectors": [...] } or a flat array [{ "id": ..., "values": [...] }].',
        context: { format: 'pinecone' },
      }
    );
  }

  const records: ImportRecord[] = [];

  for (let i = 0; i < vectors.length; i++) {
    const item = vectors[i] as Record<string, unknown>;

    if (!item || typeof item !== 'object') {
      continue;
    }

    const id = String(item.id ?? `pinecone-${i}`);
    const metadata = (item.metadata && typeof item.metadata === 'object')
      ? { ...(item.metadata as Record<string, unknown>) }
      : undefined;

    const record: ImportRecord = { id };

    // Extract dense vector from values field
    if (Array.isArray(item.values)) {
      record.vector = new Float32Array(item.values as number[]);
    }

    // Extract text from metadata.text or metadata.content
    if (metadata) {
      if (typeof metadata.text === 'string') {
        record.text = metadata.text;
      } else if (typeof metadata.content === 'string') {
        record.text = metadata.content;
      }
      record.metadata = metadata;
    }

    records.push(record);
  }

  return records;
}
