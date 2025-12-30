/**
 * CSV Document Loader
 *
 * Loader for CSV documents, converting rows to documents.
 * Zero external dependencies.
 *
 * @packageDocumentation
 */

import type { DocumentLoader, LoaderSource, LoadedDocument, LoadedDocumentMetadata, CSVLoaderOptions } from './types.js';

/**
 * Generate a unique document ID.
 */
function generateId(): string {
  return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Simple CSV parser that handles quoted fields and escaped quotes.
 */
function parseCSV(text: string, delimiter = ',', rowDelimiter = '\n'): string[][] {
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
      } else if (char === rowDelimiter || (char === '\r' && rowDelimiter === '\n')) {
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
 * CSV document loader.
 *
 * Loads documents from CSV, converting each row to a document.
 *
 * @example
 * ```typescript
 * import { CSVLoader } from '@localmode/core';
 *
 * // Load with text column specified
 * const loader = new CSVLoader({ textColumn: 'content' });
 * const docs = await loader.load(csvText);
 *
 * // Combine multiple columns
 * const multiLoader = new CSVLoader({
 *   textColumns: ['title', 'description'],
 *   columnSeparator: ' - ',
 * });
 *
 * // Use column index
 * const indexLoader = new CSVLoader({ textColumn: 2 });
 * ```
 */
export class CSVLoader implements DocumentLoader<CSVLoaderOptions> {
  readonly supports = ['.csv', 'text/csv', 'application/csv'];

  /**
   * Check if this loader can handle the source.
   */
  canLoad(source: LoaderSource): boolean {
    if (typeof source === 'string') {
      // Basic heuristic: contains comma and newline
      return source.includes(',') && source.includes('\n');
    }
    if (source instanceof File) {
      return source.name.endsWith('.csv');
    }
    if (source instanceof Blob) {
      return source.type === 'text/csv' || source.type === 'application/csv';
    }
    return false;
  }

  /**
   * Load documents from CSV source.
   */
  async load(source: LoaderSource, options: CSVLoaderOptions = {}): Promise<LoadedDocument[]> {
    const {
      generateId: customGenerateId,
      abortSignal,
      textColumn,
      textColumns,
      columnSeparator = ' ',
      idColumn,
      columnDelimiter = ',',
      rowDelimiter = '\n',
      hasHeader = true,
      skipEmpty = true,
    } = options;

    // Check for cancellation
    abortSignal?.throwIfAborted();

    // Get CSV text
    const text = await this.getText(source, options);

    // Parse CSV
    const rows = parseCSV(text, columnDelimiter, rowDelimiter);

    if (rows.length === 0) {
      return [];
    }

    // Get headers
    let headers: string[] | undefined;
    let dataRows: string[][];

    if (hasHeader) {
      headers = rows[0];
      dataRows = rows.slice(1);
    } else {
      dataRows = rows;
    }

    // Determine text column indices
    const textColumnIndices = this.getColumnIndices(textColumn, textColumns, headers);
    const idColumnIndex = this.getColumnIndex(idColumn, headers);

    // Create documents
    const documents: LoadedDocument[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];

      // Extract text
      const texts: string[] = [];
      for (const idx of textColumnIndices) {
        if (idx >= 0 && idx < row.length) {
          const value = row[idx]?.trim();
          if (value) {
            texts.push(value);
          }
        }
      }

      const text = texts.join(columnSeparator);

      if (skipEmpty && !text.trim()) {
        continue;
      }

      // Extract ID
      let id: string;
      if (customGenerateId) {
        id = customGenerateId(source, i);
      } else if (idColumnIndex !== undefined && idColumnIndex >= 0 && row[idColumnIndex]) {
        id = row[idColumnIndex].trim();
      } else {
        id = generateId();
      }

      // Build metadata
      const metadata: LoadedDocumentMetadata = {
        source: this.getSourceName(source),
        mimeType: 'text/csv',
        rowIndex: hasHeader ? i + 1 : i,
      };

      // Add all columns as metadata if headers exist
      if (headers) {
        for (let j = 0; j < headers.length; j++) {
          const header = headers[j]?.trim();
          if (header && row[j] !== undefined) {
            metadata[header] = row[j].trim();
          }
        }
      }

      documents.push({
        id,
        text: text.trim(),
        metadata,
      });
    }

    return documents;
  }

  /**
   * Get text content from source.
   */
  private async getText(source: LoaderSource, options: CSVLoaderOptions): Promise<string> {
    const { encoding = 'utf-8', maxSize, abortSignal } = options;

    if (typeof source === 'string') {
      if (maxSize && source.length > maxSize) {
        throw new Error(`CSV exceeds maximum size: ${source.length} > ${maxSize}`);
      }
      return source;
    }

    if (source instanceof Blob || source instanceof File) {
      if (maxSize && source.size > maxSize) {
        throw new Error(`File exceeds maximum size: ${source.size} > ${maxSize}`);
      }
      return source.text();
    }

    if (source instanceof ArrayBuffer) {
      if (maxSize && source.byteLength > maxSize) {
        throw new Error(`Buffer exceeds maximum size: ${source.byteLength} > ${maxSize}`);
      }
      const decoder = new TextDecoder(encoding);
      return decoder.decode(source);
    }

    if (typeof source === 'object' && 'type' in source && source.type === 'url') {
      const response = await fetch(source.url, { signal: abortSignal });
      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
      }
      return response.text();
    }

    throw new Error('Unsupported source type for CSVLoader');
  }

  /**
   * Get column indices for text extraction.
   */
  private getColumnIndices(
    textColumn: string | number | undefined,
    textColumns: (string | number)[] | undefined,
    headers?: string[]
  ): number[] {
    // Use textColumns if provided
    if (textColumns && textColumns.length > 0) {
      return textColumns.map((col) => this.getColumnIndex(col, headers) ?? -1).filter((i) => i >= 0);
    }

    // Use textColumn if provided
    if (textColumn !== undefined) {
      const idx = this.getColumnIndex(textColumn, headers);
      if (idx !== undefined) {
        return [idx];
      }
    }

    // Default: use first column or 'text', 'content', 'body' if headers exist
    if (headers) {
      const defaultFields = ['text', 'content', 'body', 'description', 'message'];
      for (const field of defaultFields) {
        const idx = headers.findIndex((h) => h.toLowerCase().trim() === field);
        if (idx >= 0) {
          return [idx];
        }
      }
    }

    // Fallback to first column
    return [0];
  }

  /**
   * Get single column index.
   */
  private getColumnIndex(
    column: string | number | undefined,
    headers?: string[]
  ): number | undefined {
    if (column === undefined) return undefined;

    if (typeof column === 'number') {
      return column;
    }

    if (headers) {
      return headers.findIndex((h) => h.toLowerCase().trim() === column.toLowerCase());
    }

    return undefined;
  }

  /**
   * Get source name for metadata.
   */
  private getSourceName(source: LoaderSource): string {
    if (typeof source === 'string') return 'csv-string';
    if (source instanceof File) return source.name;
    if (source instanceof Blob) return 'csv-blob';
    if (typeof source === 'object' && 'type' in source && source.type === 'url') {
      return source.url;
    }
    return 'csv';
  }
}

/**
 * Create a CSV loader with default options.
 */
export function createCSVLoader(_options?: CSVLoaderOptions): CSVLoader {
  return new CSVLoader();
}

