/**
 * JSONL (Newline-Delimited JSON) Parser
 *
 * Parses JSONL files where each line is a JSON object representing
 * one vector record. Supports field name variants for vector, text, and ID fields.
 *
 * @packageDocumentation
 */

import { ParseError } from '../../errors/index.js';
import type { ImportRecord } from '../types.js';

/** Field names recognized as vector fields */
const VECTOR_FIELDS = ['vector', 'embedding', 'values', 'dense_vector'];

/** Field names recognized as text fields */
const TEXT_FIELDS = ['text', 'content', 'document', 'body'];

/** Field names recognized as ID fields */
const ID_FIELDS = ['id', '_id', 'uuid'];

/**
 * Generate a unique ID for JSONL records without an ID field.
 */
function generateRecordId(lineIndex: number): string {
  return `jsonl-${lineIndex}-${Date.now().toString(36)}`;
}

/**
 * Find the first matching field value from a list of candidate names.
 */
function findField(obj: Record<string, unknown>, candidates: string[]): unknown | undefined {
  for (const name of candidates) {
    if (name in obj) {
      return obj[name];
    }
  }
  return undefined;
}

/**
 * Find the first matching field name from a list of candidates.
 */
function findFieldName(obj: Record<string, unknown>, candidates: string[]): string | undefined {
  for (const name of candidates) {
    if (name in obj) {
      return name;
    }
  }
  return undefined;
}

/**
 * Parse a JSONL (newline-delimited JSON) file into ImportRecord[].
 *
 * Each non-empty line is parsed as a JSON object. The parser detects
 * field name variants for vector (`vector`, `embedding`, `values`, `dense_vector`),
 * text (`text`, `content`, `document`, `body`), and ID (`id`, `_id`, `uuid`) fields.
 *
 * Remaining fields are included as metadata. Blank lines are skipped.
 *
 * @param content - Raw JSONL string (one JSON object per line)
 * @returns Array of parsed ImportRecord objects
 * @throws {ParseError} When a non-empty line is not valid JSON (includes line number)
 *
 * @example
 * ```ts
 * import { parseJSONL } from '@localmode/core';
 *
 * const records = parseJSONL('{"id":"v1","vector":[0.1,0.2]}\n{"id":"v2","embedding":[0.3,0.4]}');
 * // [{ id: 'v1', vector: Float32Array([0.1, 0.2]) }, { id: 'v2', vector: Float32Array([0.3, 0.4]) }]
 * ```
 */
export function parseJSONL(content: string): ImportRecord[] {
  const lines = content.split('\n');
  const records: ImportRecord[] = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx].trim();

    // Skip blank lines
    if (line === '') {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (cause) {
      throw new ParseError(
        `Failed to parse JSONL at line ${lineIdx + 1}: invalid JSON`,
        {
          hint: `Check line ${lineIdx + 1} of the JSONL file. Each non-empty line must be a valid JSON object.`,
          context: { format: 'jsonl', line: lineIdx + 1 },
          cause: cause instanceof Error ? cause : undefined,
        }
      );
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ParseError(
        `JSONL line ${lineIdx + 1}: expected a JSON object, got ${Array.isArray(parsed) ? 'array' : typeof parsed}`,
        {
          hint: `Each line in JSONL must be a JSON object like { "id": "...", "vector": [...] }.`,
          context: { format: 'jsonl', line: lineIdx + 1 },
        }
      );
    }

    const obj = parsed as Record<string, unknown>;

    // Extract ID
    const idValue = findField(obj, ID_FIELDS);
    const id = idValue != null ? String(idValue) : generateRecordId(lineIdx);

    const record: ImportRecord = { id };

    // Extract vector
    const vectorValue = findField(obj, VECTOR_FIELDS);
    if (Array.isArray(vectorValue)) {
      record.vector = new Float32Array(vectorValue as number[]);
    }

    // Extract text
    const textValue = findField(obj, TEXT_FIELDS);
    if (typeof textValue === 'string') {
      record.text = textValue;
    }

    // Build metadata from remaining fields
    // Check for a nested "metadata" object first
    const nestedMetadata = obj.metadata;
    const metadata: Record<string, unknown> = {};
    let hasMetadata = false;

    if (nestedMetadata && typeof nestedMetadata === 'object' && !Array.isArray(nestedMetadata)) {
      Object.assign(metadata, nestedMetadata);
      hasMetadata = true;
    }

    // Also collect top-level fields not in the special set
    const vectorFieldName = findFieldName(obj, VECTOR_FIELDS);
    const textFieldName = findFieldName(obj, TEXT_FIELDS);
    const idFieldName = findFieldName(obj, ID_FIELDS);

    const usedFields = new Set<string>();
    if (vectorFieldName) usedFields.add(vectorFieldName);
    if (textFieldName) usedFields.add(textFieldName);
    if (idFieldName) usedFields.add(idFieldName);
    usedFields.add('metadata');
    usedFields.add('sparse_values');

    for (const [key, value] of Object.entries(obj)) {
      if (!usedFields.has(key)) {
        metadata[key] = value;
        hasMetadata = true;
      }
    }

    if (hasMetadata) {
      record.metadata = metadata;
    }

    records.push(record);
  }

  return records;
}
