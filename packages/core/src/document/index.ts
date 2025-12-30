/**
 * Document QA Domain
 *
 * Functions and types for document and table question answering.
 *
 * @packageDocumentation
 */

// ═══════════════════════════════════════════════════════════════
// FUNCTIONS
// ═══════════════════════════════════════════════════════════════

export { askDocument, setGlobalDocumentQAProvider } from './ask-document.js';
export { askTable, setGlobalTableQAProvider } from './ask-table.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type {
  // Common types
  DocumentQAUsage,
  DocumentQAResponse,
  DocumentInput,
  TableData,
  // Document QA model interface
  DocumentQAModel,
  DoAskDocumentOptions,
  DoAskDocumentResult,
  // Table QA model interface
  TableQAModel,
  DoAskTableOptions,
  DoAskTableResult,
  // askDocument() types
  AskDocumentOptions,
  AskDocumentResult,
  // askTable() types
  AskTableOptions,
  AskTableResult,
  // Factory types
  DocumentQAModelFactory,
  TableQAModelFactory,
} from './types.js';
