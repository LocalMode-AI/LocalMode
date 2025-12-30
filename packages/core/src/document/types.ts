/**
 * Document QA Domain Types
 *
 * Types and interfaces for document and table question answering.
 *
 * @packageDocumentation
 */

import type { ImageInput } from '../vision/types.js';

// ═══════════════════════════════════════════════════════════════
// COMMON TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Usage information for document QA.
 */
export interface DocumentQAUsage {
  /** Time spent on processing (milliseconds) */
  durationMs: number;
}

/**
 * Response metadata for document QA.
 */
export interface DocumentQAResponse {
  /** Optional request ID */
  id?: string;

  /** Model ID used */
  modelId: string;

  /** Timestamp of the response */
  timestamp: Date;
}

/**
 * Document input (image of a document).
 */
export type DocumentInput = ImageInput;

/**
 * Table data structure.
 */
export interface TableData {
  /** Table headers */
  headers: string[];

  /** Table rows (array of cell values) */
  rows: string[][];
}

// ═══════════════════════════════════════════════════════════════
// DOCUMENT QA MODEL INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Interface for document question answering models.
 *
 * Providers implement this interface to enable QA on document images.
 */
export interface DocumentQAModel {
  /** Unique identifier for this model */
  readonly modelId: string;

  /** Provider name */
  readonly provider: string;

  /**
   * Answer questions about a document image.
   *
   * @param options - Document QA options
   * @returns Promise with document QA result
   */
  doAskDocument(options: DoAskDocumentOptions): Promise<DoAskDocumentResult>;
}

/**
 * Options passed to DocumentQAModel.doAskDocument()
 */
export interface DoAskDocumentOptions {
  /** Document image */
  document: DocumentInput;

  /** Questions to ask about the document */
  questions: string[];

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from DocumentQAModel.doAskDocument()
 */
export interface DoAskDocumentResult {
  /** Answers for each question */
  answers: Array<{
    answer: string;
    score: number;
  }>;

  /** Usage information */
  usage: DocumentQAUsage;
}

// ═══════════════════════════════════════════════════════════════
// TABLE QA MODEL INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Interface for table question answering models.
 *
 * Providers implement this interface to enable QA on tabular data.
 */
export interface TableQAModel {
  /** Unique identifier for this model */
  readonly modelId: string;

  /** Provider name */
  readonly provider: string;

  /**
   * Answer questions about a table.
   *
   * @param options - Table QA options
   * @returns Promise with table QA result
   */
  doAskTable(options: DoAskTableOptions): Promise<DoAskTableResult>;
}

/**
 * Options passed to TableQAModel.doAskTable()
 */
export interface DoAskTableOptions {
  /** Table data */
  table: TableData;

  /** Questions to ask about the table */
  questions: string[];

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from TableQAModel.doAskTable()
 */
export interface DoAskTableResult {
  /** Answers for each question */
  answers: Array<{
    answer: string;
    cells?: string[];
    aggregator?: string;
    score: number;
  }>;

  /** Usage information */
  usage: DocumentQAUsage;
}

// ═══════════════════════════════════════════════════════════════
// ASK DOCUMENT FUNCTION OPTIONS & RESULTS
// ═══════════════════════════════════════════════════════════════

/**
 * Options for the askDocument() function.
 *
 * @example
 * ```ts
 * const { answer } = await askDocument({
 *   model: transformers.documentQA('Xenova/donut-base-finetuned-docvqa'),
 *   document: invoiceImage,
 *   question: 'What is the total amount?',
 * });
 * ```
 */
export interface AskDocumentOptions {
  /** The document QA model to use */
  model: DocumentQAModel | string;

  /** Document image to analyze */
  document: DocumentInput;

  /** Question to ask about the document */
  question: string;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the askDocument() function.
 */
export interface AskDocumentResult {
  /** The answer to the question */
  answer: string;

  /** Confidence score (0-1) */
  score: number;

  /** Usage information */
  usage: DocumentQAUsage;

  /** Response metadata */
  response: DocumentQAResponse;
}

// ═══════════════════════════════════════════════════════════════
// ASK TABLE FUNCTION OPTIONS & RESULTS
// ═══════════════════════════════════════════════════════════════

/**
 * Options for the askTable() function.
 *
 * @example
 * ```ts
 * const { answer } = await askTable({
 *   model: transformers.tableQA('Xenova/tapas-base-finetuned-wtq'),
 *   table: {
 *     headers: ['Name', 'Age', 'City'],
 *     rows: [
 *       ['Alice', '30', 'New York'],
 *       ['Bob', '25', 'Los Angeles'],
 *     ],
 *   },
 *   question: 'Who is the oldest?',
 * });
 * ```
 */
export interface AskTableOptions {
  /** The table QA model to use */
  model: TableQAModel | string;

  /** Table data to analyze */
  table: TableData;

  /** Question to ask about the table */
  question: string;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the askTable() function.
 */
export interface AskTableResult {
  /** The answer to the question */
  answer: string;

  /** Cells used to derive the answer */
  cells?: string[];

  /** Aggregation operation used (e.g., "SUM", "COUNT", "AVERAGE") */
  aggregator?: string;

  /** Confidence score (0-1) */
  score: number;

  /** Usage information */
  usage: DocumentQAUsage;

  /** Response metadata */
  response: DocumentQAResponse;
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER FACTORY TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Factory function type for creating document QA models.
 */
export type DocumentQAModelFactory = (
  modelId: string,
  settings?: Record<string, unknown>
) => DocumentQAModel;

/**
 * Factory function type for creating table QA models.
 */
export type TableQAModelFactory = (
  modelId: string,
  settings?: Record<string, unknown>
) => TableQAModel;

