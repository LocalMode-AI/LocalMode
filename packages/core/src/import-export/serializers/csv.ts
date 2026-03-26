/**
 * CSV Serializer
 *
 * Serializes ImportRecord[] to CSV format with vector column as JSON array.
 *
 * @packageDocumentation
 */

import type { ImportRecord, ExportToCSVOptions } from '../types.js';

/**
 * Escape a CSV value per RFC 4180.
 * Wraps in double quotes if the value contains the delimiter, quotes, or newlines.
 */
function escapeCSVValue(value: string, delimiter: string): string {
  if (value.includes(delimiter) || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Serialize ImportRecord[] to a CSV string.
 *
 * @param records - Records to serialize
 * @param options - CSV export options
 * @returns CSV string with header row and data rows
 */
export function serializeToCSV(records: ImportRecord[], options?: ExportToCSVOptions): string {
  const delimiter = options?.delimiter ?? ',';
  const includeVectors = options?.includeVectors ?? true;
  const includeText = options?.includeText ?? true;

  if (records.length === 0) {
    return '';
  }

  // Determine if any records have vectors
  const hasVectors = includeVectors && records.some((r) => r.vector);
  const hasText = includeText && records.some((r) => r.text);

  // Collect all metadata keys across all records
  const metadataKeys = new Set<string>();
  for (const record of records) {
    if (record.metadata) {
      for (const key of Object.keys(record.metadata)) {
        metadataKeys.add(key);
      }
    }
  }
  const sortedMetadataKeys = Array.from(metadataKeys).sort();

  // Build header
  const headerParts: string[] = ['id'];
  if (hasText) headerParts.push('text');
  if (hasVectors) headerParts.push('vector');
  headerParts.push(...sortedMetadataKeys);

  const lines: string[] = [headerParts.join(delimiter)];

  // Build data rows
  for (const record of records) {
    const parts: string[] = [escapeCSVValue(record.id, delimiter)];

    if (hasText) {
      parts.push(escapeCSVValue(record.text ?? '', delimiter));
    }

    if (hasVectors) {
      if (record.vector) {
        const vectorStr = `[${Array.from(record.vector).join(',')}]`;
        parts.push(escapeCSVValue(vectorStr, delimiter));
      } else {
        parts.push('');
      }
    }

    for (const key of sortedMetadataKeys) {
      const value = record.metadata?.[key];
      if (value === undefined || value === null) {
        parts.push('');
      } else {
        parts.push(escapeCSVValue(String(value), delimiter));
      }
    }

    lines.push(parts.join(delimiter));
  }

  return lines.join('\n');
}
