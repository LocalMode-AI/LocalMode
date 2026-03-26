/**
 * Export Serializers
 *
 * Convert ImportRecord[] to CSV or JSONL strings for interoperability.
 *
 * @packageDocumentation
 */

import { serializeToCSV } from './serializers/csv.js';
import { serializeToJSONL } from './serializers/jsonl.js';
import type { ImportRecord, ExportToCSVOptions, ExportToJSONLOptions } from './types.js';

/**
 * Export ImportRecord[] as a CSV string.
 *
 * Produces a header row followed by data rows. Vector columns contain
 * JSON-encoded arrays. Metadata fields become additional columns.
 * Values with commas or quotes are escaped per RFC 4180.
 *
 * @param records - Records to export
 * @param options - CSV export options
 * @returns CSV string
 *
 * @example
 * ```ts
 * import { exportToCSV } from '@localmode/core';
 *
 * const csv = exportToCSV(records, { delimiter: ',', includeVectors: true });
 * // id,text,vector,category
 * // v1,hello,"[0.1,0.2]",docs
 * ```
 */
export function exportToCSV(records: ImportRecord[], options?: ExportToCSVOptions): string {
  return serializeToCSV(records, options);
}

/**
 * Export ImportRecord[] as a JSONL string.
 *
 * Each record becomes one JSON line with `id`, optional `text`,
 * optional vector (as number[]), and flattened metadata fields.
 *
 * @param records - Records to export
 * @param options - JSONL export options
 * @returns JSONL string (one JSON object per line)
 *
 * @example
 * ```ts
 * import { exportToJSONL } from '@localmode/core';
 *
 * const jsonl = exportToJSONL(records, { vectorFieldName: 'embedding' });
 * // {"id":"v1","text":"hello","embedding":[0.1,0.2],"category":"docs"}
 * ```
 */
export function exportToJSONL(records: ImportRecord[], options?: ExportToJSONLOptions): string {
  return serializeToJSONL(records, options);
}
