/**
 * Import Orchestrator
 *
 * `importFrom()` orchestrates parsing, validation, optional re-embedding,
 * and batched insertion of external vector data into a VectorDB.
 *
 * `parseExternalFormat()` provides standalone parsing for preview/validation
 * without committing to a VectorDB.
 *
 * @packageDocumentation
 */

import { ParseError, DimensionMismatchOnImportError } from '../errors/index.js';
import { detectFormat } from './detect.js';
import { parsePinecone } from './parsers/pinecone.js';
import { parseChroma } from './parsers/chroma.js';
import { parseCSVVectors } from './parsers/csv.js';
import { parseJSONL } from './parsers/jsonl.js';
import type {
  ExternalFormat,
  ImportRecord,
  ParseResult,
  ImportFromOptions,
  ImportStats,
} from './types.js';

// ============================================================================
// parseExternalFormat
// ============================================================================

/**
 * Parse external format content into ImportRecord[] with summary statistics.
 *
 * Useful for preview, validation, and format inspection before committing
 * to an import. Does not require a VectorDB instance.
 *
 * @param content - Raw content string to parse
 * @param options - Optional format specification (auto-detected if omitted)
 * @returns ParseResult with records, format, counts, and detected dimensions
 * @throws {ParseError} On malformed input or unrecognized format
 *
 * @example
 * ```ts
 * import { parseExternalFormat } from '@localmode/core';
 *
 * const result = parseExternalFormat(fileContent);
 * console.log(result.format);           // 'pinecone'
 * console.log(result.totalRecords);     // 100
 * console.log(result.recordsWithVectors); // 80
 * console.log(result.dimensions);       // 384
 * ```
 */
export function parseExternalFormat(
  content: string,
  options?: { format?: ExternalFormat }
): ParseResult {
  const format = options?.format ?? detectFormat(content);
  const records = parseByFormat(content, format);

  // Compute statistics
  let recordsWithVectors = 0;
  let recordsWithTextOnly = 0;
  let dimensions: number | null = null;

  for (const record of records) {
    if (record.vector) {
      recordsWithVectors++;
      if (dimensions === null) {
        dimensions = record.vector.length;
      }
    } else if (record.text) {
      recordsWithTextOnly++;
    }
  }

  return {
    records,
    format,
    totalRecords: records.length,
    recordsWithVectors,
    recordsWithTextOnly,
    dimensions,
  };
}

// ============================================================================
// importFrom
// ============================================================================

/**
 * Import external vector data into a VectorDB.
 *
 * Orchestrates: parse -> validate dimensions -> re-embed text-only -> batch insert.
 *
 * @param options - Import configuration
 * @returns ImportStats with counts, duration, and format
 * @throws {ParseError} On malformed input
 * @throws {DimensionMismatchOnImportError} When vector dimensions do not match the target DB
 *
 * @example
 * ```ts
 * import { importFrom } from '@localmode/core';
 *
 * const stats = await importFrom({
 *   db: myVectorDB,
 *   content: pineconeExportJson,
 *   format: 'pinecone',
 *   model: embeddingModel,  // re-embed text-only records
 *   batchSize: 100,
 *   onProgress: (p) => console.log(`${p.phase}: ${p.completed}/${p.total}`),
 *   abortSignal: controller.signal,
 * });
 *
 * console.log(`Imported ${stats.imported}, skipped ${stats.skipped}, re-embedded ${stats.reEmbedded}`);
 * ```
 */
export async function importFrom(options: ImportFromOptions): Promise<ImportStats> {
  const {
    db,
    content,
    format,
    model,
    batchSize = 100,
    skipDimensionCheck = false,
    onProgress,
    abortSignal,
  } = options;

  const startTime = performance.now();

  // === Phase 1: Parsing ===
  abortSignal?.throwIfAborted();

  onProgress?.({
    phase: 'parsing',
    completed: 0,
    total: 1,
    overallCompleted: 0,
    overallTotal: 1,
  });

  const parseResult = parseExternalFormat(content, { format });
  const { records, format: detectedFormat, dimensions: parsedDimensions } = parseResult;

  onProgress?.({
    phase: 'parsing',
    completed: 1,
    total: 1,
    overallCompleted: 1,
    overallTotal: records.length + 1,
  });

  // === Phase 2: Validating ===
  abortSignal?.throwIfAborted();

  onProgress?.({
    phase: 'validating',
    completed: 0,
    total: records.length,
    overallCompleted: 1,
    overallTotal: records.length + 1,
  });

  // Separate records by type
  const recordsWithVectors: ImportRecord[] = [];
  const textOnlyRecords: ImportRecord[] = [];
  const skippedRecords: ImportRecord[] = [];

  for (const record of records) {
    if (record.vector) {
      recordsWithVectors.push(record);
    } else if (record.text && model) {
      textOnlyRecords.push(record);
    } else {
      skippedRecords.push(record);
    }
  }

  // Dimension validation
  if (!skipDimensionCheck && recordsWithVectors.length > 0) {
    const dbDimensions = db.dimensions;

    for (const record of recordsWithVectors) {
      if (record.vector && record.vector.length !== dbDimensions) {
        throw new DimensionMismatchOnImportError(
          dbDimensions,
          record.vector.length,
          record.id
        );
      }
    }
  }

  onProgress?.({
    phase: 'validating',
    completed: records.length,
    total: records.length,
    overallCompleted: 1 + records.length,
    overallTotal: records.length + 1,
  });

  // === Phase 3: Re-embedding (if model provided and text-only records exist) ===
  let reEmbeddedCount = 0;
  const overallTotal = 1 + records.length + textOnlyRecords.length + recordsWithVectors.length + textOnlyRecords.length;

  if (model && textOnlyRecords.length > 0) {
    abortSignal?.throwIfAborted();

    const { embedMany } = await import('../embeddings/embed.js');
    let embeddingCompleted = 0;

    for (let i = 0; i < textOnlyRecords.length; i += batchSize) {
      abortSignal?.throwIfAborted();

      const batch = textOnlyRecords.slice(i, i + batchSize);
      const texts = batch.map((r) => r.text!);

      const result = await embedMany({
        model,
        values: texts,
        abortSignal,
      });

      // Assign vectors back to records
      for (let j = 0; j < batch.length; j++) {
        batch[j].vector = result.embeddings[j];
      }

      embeddingCompleted += batch.length;
      reEmbeddedCount += batch.length;

      onProgress?.({
        phase: 'embedding',
        completed: embeddingCompleted,
        total: textOnlyRecords.length,
        overallCompleted: 1 + records.length + embeddingCompleted,
        overallTotal,
      });
    }
  }

  // === Phase 4: Importing ===
  abortSignal?.throwIfAborted();

  // Combine records that have vectors (either original or re-embedded)
  const importableRecords = [...recordsWithVectors, ...textOnlyRecords.filter((r) => r.vector)];
  let importedCount = 0;

  for (let i = 0; i < importableRecords.length; i += batchSize) {
    abortSignal?.throwIfAborted();

    const batch = importableRecords.slice(i, i + batchSize);
    const documents = batch.map((record) => ({
      id: record.id,
      vector: record.vector!,
      metadata: {
        ...record.metadata,
        ...(record.text ? { text: record.text } : {}),
      },
    }));

    await db.addMany(documents);
    importedCount += batch.length;

    onProgress?.({
      phase: 'importing',
      completed: importedCount,
      total: importableRecords.length,
      overallCompleted: 1 + records.length + textOnlyRecords.length + importedCount,
      overallTotal,
    });
  }

  const durationMs = performance.now() - startTime;

  // Determine effective dimensions
  const effectiveDimensions = parsedDimensions
    ?? (importableRecords.length > 0 && importableRecords[0].vector
      ? importableRecords[0].vector.length
      : db.dimensions);

  return {
    imported: importedCount,
    skipped: skippedRecords.length,
    reEmbedded: reEmbeddedCount,
    totalParsed: records.length,
    format: detectedFormat,
    dimensions: effectiveDimensions,
    durationMs,
  };
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Dispatch to the appropriate parser based on format.
 */
function parseByFormat(content: string, format: ExternalFormat): ImportRecord[] {
  switch (format) {
    case 'pinecone':
      return parsePinecone(content);
    case 'chroma':
      return parseChroma(content);
    case 'csv':
      return parseCSVVectors(content);
    case 'jsonl':
      return parseJSONL(content);
    default:
      throw new ParseError(
        `Unsupported format: ${format}`,
        { hint: `Supported formats: pinecone, chroma, csv, jsonl.` }
      );
  }
}
