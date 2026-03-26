/**
 * CSV Vector Parser
 *
 * Parses CSV files containing vector columns into ImportRecord[].
 * Hand-written CSV parser handles quoted fields and escaped quotes,
 * following the same approach as the existing CSVLoader.
 *
 * @packageDocumentation
 */

import type { ImportRecord, CSVParseOptions } from '../types.js';

/** Column names that are auto-detected as vector columns */
const VECTOR_COLUMN_NAMES = ['vector', 'embedding', 'values', 'dense_vector'];

/** Column names that are auto-detected as ID columns */
const ID_COLUMN_NAMES = ['id', '_id', 'uuid'];

/** Column names that are auto-detected as text columns */
const TEXT_COLUMN_NAMES = ['text', 'content', 'document', 'body'];

/**
 * Simple CSV parser handling quoted fields and escaped quotes.
 * Follows RFC 4180 conventions.
 */
function parseCSVRows(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote
          currentField += '"';
          i++;
        } else {
          // End of quoted field
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\r' && nextChar === '\n') {
        // Windows line ending
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++; // Skip \n
      } else if (char === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  // Add last field and row
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Find the index of a column by name (case-insensitive) from a list of candidates.
 */
function findColumnIndex(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const index = headers.findIndex((h) => h.toLowerCase().trim() === candidate);
    if (index >= 0) return index;
  }
  return -1;
}

/**
 * Generate a unique ID for CSV rows without an ID column.
 */
function generateRowId(rowIndex: number): string {
  return `csv-row-${rowIndex}`;
}

/**
 * Parse a CSV file containing vector data into ImportRecord[].
 *
 * Auto-detects vector, ID, and text columns by name. Remaining columns
 * become metadata. The vector column should contain JSON-encoded arrays
 * (e.g., `"[0.1, 0.2, 0.3]"`).
 *
 * @param content - Raw CSV string with header row
 * @param options - Parsing options for column overrides and delimiter
 * @returns Array of parsed ImportRecord objects
 *
 * @example
 * ```ts
 * import { parseCSVVectors } from '@localmode/core';
 *
 * const records = parseCSVVectors('id,text,vector\nv1,hello,"[0.1, 0.2]"');
 * // [{ id: 'v1', text: 'hello', vector: Float32Array([0.1, 0.2]) }]
 * ```
 */
export function parseCSVVectors(content: string, options?: CSVParseOptions): ImportRecord[] {
  const delimiter = options?.delimiter ?? ',';
  const rows = parseCSVRows(content.trim(), delimiter);

  if (rows.length < 2) {
    return [];
  }

  // First row is the header
  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);

  // Determine column indices
  const vectorColIndex = options?.vectorColumn
    ? headers.findIndex((h) => h.toLowerCase().trim() === options.vectorColumn!.toLowerCase())
    : findColumnIndex(headers, VECTOR_COLUMN_NAMES);

  const idColIndex = options?.idColumn
    ? headers.findIndex((h) => h.toLowerCase().trim() === options.idColumn!.toLowerCase())
    : findColumnIndex(headers, ID_COLUMN_NAMES);

  const textColIndex = options?.textColumn
    ? headers.findIndex((h) => h.toLowerCase().trim() === options.textColumn!.toLowerCase())
    : findColumnIndex(headers, TEXT_COLUMN_NAMES);

  // Identify metadata columns (all columns that are not id, text, or vector)
  const specialIndices = new Set<number>();
  if (vectorColIndex >= 0) specialIndices.add(vectorColIndex);
  if (idColIndex >= 0) specialIndices.add(idColIndex);
  if (textColIndex >= 0) specialIndices.add(textColIndex);

  const metadataIndices: number[] = [];
  for (let i = 0; i < headers.length; i++) {
    if (!specialIndices.has(i)) {
      metadataIndices.push(i);
    }
  }

  const records: ImportRecord[] = [];

  for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
    const row = dataRows[rowIdx];

    // Skip completely empty rows
    if (row.length === 0 || (row.length === 1 && row[0].trim() === '')) {
      continue;
    }

    const record: ImportRecord = {
      id: idColIndex >= 0 && row[idColIndex]
        ? row[idColIndex].trim()
        : generateRowId(rowIdx),
    };

    // Parse vector column
    if (vectorColIndex >= 0 && row[vectorColIndex]) {
      const vectorStr = row[vectorColIndex].trim();
      if (vectorStr) {
        try {
          const parsed = JSON.parse(vectorStr);
          if (Array.isArray(parsed)) {
            record.vector = new Float32Array(parsed);
          }
        } catch {
          // Malformed vector JSON — treat as text-only record
        }
      }
    }

    // Extract text
    if (textColIndex >= 0 && row[textColIndex]) {
      const text = row[textColIndex].trim();
      if (text) {
        record.text = text;
      }
    }

    // Build metadata from remaining columns
    if (metadataIndices.length > 0) {
      const metadata: Record<string, unknown> = {};
      let hasMetadata = false;

      for (const idx of metadataIndices) {
        const header = headers[idx];
        const value = row[idx]?.trim();
        if (header && value !== undefined && value !== '') {
          // Try to parse as number or boolean
          metadata[header] = parseMetadataValue(value);
          hasMetadata = true;
        }
      }

      if (hasMetadata) {
        record.metadata = metadata;
      }
    }

    records.push(record);
  }

  return records;
}

/**
 * Try to parse a metadata value as a number or boolean, falling back to string.
 */
function parseMetadataValue(value: string): unknown {
  // Boolean
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Number
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== '') return num;

  return value;
}
