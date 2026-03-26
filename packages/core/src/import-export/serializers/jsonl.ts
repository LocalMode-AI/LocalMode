/**
 * JSONL Serializer
 *
 * Serializes ImportRecord[] to JSONL format (one JSON object per line).
 *
 * @packageDocumentation
 */

import type { ImportRecord, ExportToJSONLOptions } from '../types.js';

/**
 * Serialize ImportRecord[] to a JSONL string.
 *
 * Each record becomes one JSON line with `id`, optional `text`,
 * optional vector (as number[]), and flattened metadata fields.
 *
 * @param records - Records to serialize
 * @param options - JSONL export options
 * @returns JSONL string with one JSON object per line
 */
export function serializeToJSONL(records: ImportRecord[], options?: ExportToJSONLOptions): string {
  const includeVectors = options?.includeVectors ?? true;
  const includeText = options?.includeText ?? true;
  const vectorFieldName = options?.vectorFieldName ?? 'vector';

  const lines: string[] = [];

  for (const record of records) {
    const obj: Record<string, unknown> = { id: record.id };

    if (includeText && record.text) {
      obj.text = record.text;
    }

    if (includeVectors && record.vector) {
      obj[vectorFieldName] = Array.from(record.vector);
    }

    // Flatten metadata into the top-level object
    if (record.metadata) {
      for (const [key, value] of Object.entries(record.metadata)) {
        // Don't overwrite existing fields
        if (!(key in obj)) {
          obj[key] = value;
        }
      }
    }

    lines.push(JSON.stringify(obj));
  }

  return lines.join('\n');
}
