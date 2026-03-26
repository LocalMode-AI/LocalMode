/**
 * Vector Import/Export
 *
 * Parse, import, export, and convert vector data between formats.
 * Supports Pinecone JSON, ChromaDB JSON, CSV, and JSONL.
 *
 * @packageDocumentation
 */

// Types
export type {
  ExternalFormat,
  ImportRecord,
  ParseResult,
  ImportFromOptions,
  ImportProgress,
  ImportStats,
  ExportToCSVOptions,
  ExportToJSONLOptions,
  ConvertOptions,
  CSVParseOptions,
} from './types.js';

// Format detection
export { detectFormat } from './detect.js';

// Parsers (internal — exposed through parseExternalFormat)
export { parsePinecone } from './parsers/pinecone.js';
export { parseChroma } from './parsers/chroma.js';
export { parseCSVVectors } from './parsers/csv.js';
export { parseJSONL } from './parsers/jsonl.js';

// Orchestrator
export { importFrom, parseExternalFormat } from './import-from.js';

// Export serializers
export { exportToCSV, exportToJSONL } from './export-to.js';

// Format conversion
export { convertFormat } from './convert.js';
