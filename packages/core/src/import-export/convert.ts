/**
 * Format Conversion
 *
 * Convert between external vector data formats without a VectorDB.
 * Useful for offline data preparation and interoperability.
 *
 * @packageDocumentation
 */

import { parseExternalFormat } from './import-from.js';
import { serializeToCSV } from './serializers/csv.js';
import { serializeToJSONL } from './serializers/jsonl.js';
import type { ImportRecord, ConvertOptions } from './types.js';

/**
 * Serialize records to Pinecone JSON format.
 *
 * Produces `{ "vectors": [{ "id": ..., "values": [...], "metadata": {...} }] }`.
 */
function serializeToPinecone(records: ImportRecord[]): string {
  const vectors = records.map((record) => {
    const entry: Record<string, unknown> = { id: record.id };

    if (record.vector) {
      entry.values = Array.from(record.vector);
    }

    // Build metadata, including text if present
    const metadata: Record<string, unknown> = { ...record.metadata };
    if (record.text) {
      metadata.text = record.text;
    }

    if (Object.keys(metadata).length > 0) {
      entry.metadata = metadata;
    }

    return entry;
  });

  return JSON.stringify({ vectors }, null, 2);
}

/**
 * Serialize records to ChromaDB columnar JSON format.
 *
 * Produces `{ "ids": [...], "embeddings": [...], "metadatas": [...], "documents": [...] }`.
 */
function serializeToChroma(records: ImportRecord[]): string {
  const ids: string[] = [];
  const embeddings: (number[] | null)[] = [];
  const metadatas: (Record<string, unknown> | null)[] = [];
  const documents: (string | null)[] = [];

  for (const record of records) {
    ids.push(record.id);
    embeddings.push(record.vector ? Array.from(record.vector) : null);
    metadatas.push(record.metadata ? { ...record.metadata } : null);
    documents.push(record.text ?? null);
  }

  // Check if all embeddings are null
  const hasAnyEmbeddings = embeddings.some((e) => e !== null);

  return JSON.stringify(
    {
      ids,
      embeddings: hasAnyEmbeddings ? embeddings : null,
      metadatas,
      documents,
    },
    null,
    2
  );
}

/**
 * Convert vector data between external formats without a VectorDB.
 *
 * Parses the input content in the source format and serializes it
 * in the target format. Useful for offline data preparation.
 *
 * @param content - Raw content string in the source format
 * @param options - Conversion options (source format auto-detected if omitted)
 * @returns Content string in the target format
 *
 * @example
 * ```ts
 * import { convertFormat } from '@localmode/core';
 *
 * // Convert Pinecone JSON to CSV
 * const csv = convertFormat(pineconeJson, { from: 'pinecone', to: 'csv' });
 *
 * // Convert ChromaDB JSON to JSONL (auto-detect source)
 * const jsonl = convertFormat(chromaJson, { to: 'jsonl' });
 * ```
 */
export function convertFormat(content: string, options: ConvertOptions): string {
  const parseResult = parseExternalFormat(content, { format: options.from });
  const records = parseResult.records;

  switch (options.to) {
    case 'csv':
      return serializeToCSV(records, options.csvOptions);
    case 'jsonl':
      return serializeToJSONL(records, options.jsonlOptions);
    case 'pinecone':
      return serializeToPinecone(records);
    case 'chroma':
      return serializeToChroma(records);
    default:
      throw new Error(`Unsupported target format: ${options.to}`);
  }
}
