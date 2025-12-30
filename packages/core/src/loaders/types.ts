/**
 * Document Loader Types
 *
 * Interfaces and types for loading documents from various sources.
 * Part of the production-essential extensibility system.
 *
 * @packageDocumentation
 */

// ============================================================================
// Loader Source Types
// ============================================================================

/**
 * Possible sources for document loading.
 */
export type LoaderSource =
  | string // Text content directly
  | Blob // File blob
  | ArrayBuffer // Raw binary data
  | File // Browser File object
  | { type: 'url'; url: string } // URL to fetch
  | { type: 'custom'; data: unknown }; // Custom source

// ============================================================================
// Loaded Document Types
// ============================================================================

/**
 * A document that has been loaded and is ready for processing.
 */
export interface LoadedDocument {
  /** Unique identifier for the document */
  id: string;

  /** Extracted text content */
  text: string;

  /** Document metadata */
  metadata: LoadedDocumentMetadata;
}

/**
 * Metadata for a loaded document.
 */
export interface LoadedDocumentMetadata {
  /** Source identifier (file path, URL, etc.) */
  source: string;

  /** MIME type if known */
  mimeType?: string;

  /** Document title if available */
  title?: string;

  /** Page count for multi-page documents */
  pageCount?: number;

  /** Document creation date */
  createdAt?: Date;

  /** Document modification date */
  modifiedAt?: Date;

  /** File size in bytes */
  sizeBytes?: number;

  /** Additional loader-specific metadata */
  [key: string]: unknown;
}

// ============================================================================
// Loader Options Types
// ============================================================================

/**
 * Base options for all document loaders.
 */
export interface LoaderOptions {
  /** Custom ID generator for documents */
  generateId?: (source: LoaderSource, index: number) => string;

  /** Maximum file size to load (bytes) */
  maxSize?: number;

  /** Encoding for text files (default: 'utf-8') */
  encoding?: string;

  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}

/**
 * Options for text document loader.
 */
export interface TextLoaderOptions extends LoaderOptions {
  /** Separator to use when splitting (optional) */
  separator?: string;

  /** Whether to trim whitespace */
  trim?: boolean;
}

/**
 * Options for JSON document loader.
 */
export interface JSONLoaderOptions extends LoaderOptions {
  /** Fields to extract text from */
  textFields?: string[];

  /** Whether to extract text from all string fields */
  extractAllStrings?: boolean;

  /** Field separator when combining multiple fields */
  fieldSeparator?: string;

  /** Path to the array of records (e.g., 'data.items') */
  recordsPath?: string;
}

/**
 * Options for CSV document loader.
 */
export interface CSVLoaderOptions extends LoaderOptions {
  /** Column to use as text content */
  textColumn?: string | number;

  /** Columns to combine for text content */
  textColumns?: (string | number)[];

  /** Column separator for combined columns */
  columnSeparator?: string;

  /** Column to use as document ID */
  idColumn?: string | number;

  /** Row delimiter (default: '\n') */
  rowDelimiter?: string;

  /** Column delimiter (default: ',') */
  columnDelimiter?: string;

  /** Whether first row is header (default: true) */
  hasHeader?: boolean;

  /** Whether to skip empty rows */
  skipEmpty?: boolean;
}

/**
 * Options for HTML document loader.
 */
export interface HTMLLoaderOptions extends LoaderOptions {
  /** CSS selector to extract content from */
  selector?: string;

  /** Multiple selectors to extract from */
  selectors?: string[];

  /** Whether to extract metadata from head */
  extractMetadata?: boolean;

  /** Whether to preserve some formatting (e.g., paragraph breaks) */
  preserveFormatting?: boolean;

  /** Tags to ignore content from */
  ignoreTags?: string[];
}

// ============================================================================
// Loader Result Types
// ============================================================================

/**
 * Result from loading a document or documents.
 */
export interface LoaderResult {
  /** Loaded documents */
  documents: LoadedDocument[];

  /** Number of documents loaded */
  count: number;

  /** Total size in bytes */
  totalBytes: number;

  /** Processing duration in milliseconds */
  durationMs: number;

  /** Any errors encountered (for partial success) */
  errors?: Array<{
    source: string;
    message: string;
  }>;
}

// ============================================================================
// Document Loader Interface
// ============================================================================

/**
 * Interface for document loaders.
 *
 * Implement this interface to create custom loaders for different file types.
 *
 * @example Custom PDF Loader (requires external dependency)
 * ```ts
 * class PDFLoader implements DocumentLoader {
 *   readonly supports = ['.pdf', 'application/pdf'];
 *
 *   canLoad(source: LoaderSource): boolean {
 *     // Check if source is a PDF
 *     return true;
 *   }
 *
 *   async load(source: LoaderSource): Promise<LoadedDocument[]> {
 *     // Use PDF library to extract text
 *     return [{ id: 'doc1', text: '...', metadata: { source: 'file.pdf' } }];
 *   }
 * }
 * ```
 */
export interface DocumentLoader<TOptions extends LoaderOptions = LoaderOptions> {
  /** File extensions or MIME types this loader supports */
  readonly supports: string[];

  /**
   * Check if this loader can handle the given source.
   *
   * @param source - The source to check
   * @returns true if this loader can handle the source
   */
  canLoad?(source: LoaderSource): boolean;

  /**
   * Load documents from the source.
   *
   * @param source - The source to load from
   * @param options - Loader options
   * @returns Array of loaded documents
   */
  load(source: LoaderSource, options?: TOptions): Promise<LoadedDocument[]>;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Factory function type for creating document loaders.
 */
export type DocumentLoaderFactory<TOptions extends LoaderOptions = LoaderOptions> = (
  options?: TOptions
) => DocumentLoader<TOptions>;

