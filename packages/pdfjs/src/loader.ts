/**
 * PDF Document Loader
 *
 * Implements DocumentLoader interface for PDF files.
 *
 * @packageDocumentation
 */

import type {
  DocumentLoader,
  LoadedDocument,
  LoaderSource,
  LoaderOptions,
} from '@localmode/core';
import type { PDFLoaderOptions } from './types.js';
import { extractPDFText } from './extract.js';

/**
 * PDF Document Loader implementation.
 *
 * Extracts text from PDF files for use in RAG pipelines.
 *
 * @example Basic usage
 * ```ts
 * import { PDFLoader } from '@localmode/pdfjs';
 * import { loadDocument } from '@localmode/core';
 *
 * const loader = new PDFLoader();
 * const documents = await loader.load(pdfBlob);
 *
 * for (const doc of documents) {
 *   console.log(doc.text);
 * }
 * ```
 *
 * @example Split by page
 * ```ts
 * const loader = new PDFLoader({ splitByPage: true });
 * const documents = await loader.load(pdfBlob);
 *
 * // Each page is a separate document
 * console.log(`Loaded ${documents.length} pages`);
 * ```
 */
export class PDFLoader implements DocumentLoader {
  /** File extensions and MIME types this loader supports */
  readonly supports = ['.pdf', 'application/pdf'];

  private options: PDFLoaderOptions;
  private documentCounter = 0;

  constructor(options: PDFLoaderOptions = {}) {
    this.options = {
      splitByPage: false,
      pageSeparator: '\n\n---\n\n',
      includePageNumbers: true,
      ...options,
    };
  }

  /**
   * Check if this loader can handle the given source.
   */
  canLoad(source: LoaderSource): boolean {
    // Check by MIME type
    if (source instanceof Blob) {
      return source.type === 'application/pdf';
    }

    // Check by File name
    if (source instanceof File) {
      return source.name.toLowerCase().endsWith('.pdf') || source.type === 'application/pdf';
    }

    // Check by URL object
    if (typeof source === 'object' && 'type' in source && source.type === 'url') {
      return source.url.toLowerCase().endsWith('.pdf');
    }

    // For string paths
    if (typeof source === 'string') {
      return source.toLowerCase().endsWith('.pdf');
    }

    // For ArrayBuffer, accept it (we'll validate during load)
    if (source instanceof ArrayBuffer) {
      return true;
    }

    return false;
  }

  /**
   * Get source identifier for metadata.
   */
  private getSourceId(source: LoaderSource): string {
    if (source instanceof File) {
      return source.name;
    }
    if (source instanceof Blob) {
      return `blob-${this.documentCounter}`;
    }
    if (typeof source === 'object' && 'type' in source && source.type === 'url') {
      return source.url;
    }
    if (typeof source === 'string') {
      return source;
    }
    return `document-${this.documentCounter}`;
  }

  /**
   * Load documents from a PDF source.
   */
  async load(source: LoaderSource, options?: LoaderOptions): Promise<LoadedDocument[]> {
    const abortSignal = options?.abortSignal;

    abortSignal?.throwIfAborted();

    const sourceId = this.getSourceId(source);

    // Convert source to something extractPDFText can handle
    let pdfSource: Blob | ArrayBuffer | Uint8Array | string;

    if (source instanceof Blob || source instanceof ArrayBuffer) {
      pdfSource = source;
    } else if (source instanceof File) {
      pdfSource = source;
    } else if (typeof source === 'object' && 'type' in source && source.type === 'url') {
      // Fetch the URL
      const response = await fetch(source.url, { signal: abortSignal });
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF from ${source.url}: ${response.statusText}`);
      }
      pdfSource = await response.arrayBuffer();
    } else if (typeof source === 'string') {
      // Could be a path or base64 - treat as path/URL
      const response = await fetch(source, { signal: abortSignal });
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF from ${source}: ${response.statusText}`);
      }
      pdfSource = await response.arrayBuffer();
    } else {
      throw new Error('Unsupported source type for PDF loading');
    }

    // Extract text from PDF
    const result = await extractPDFText(pdfSource, {
      includePageNumbers: this.options.includePageNumbers,
      pageSeparator: this.options.pageSeparator,
      maxPages: this.options.maxPages,
      password: this.options.password,
      abortSignal,
    });

    abortSignal?.throwIfAborted();

    const documents: LoadedDocument[] = [];

    if (this.options.splitByPage) {
      // Create a document for each page
      for (const page of result.pages) {
        this.documentCounter++;
        const id = options?.generateId
          ? options.generateId(source, page.pageNumber)
          : `${sourceId}-page-${page.pageNumber}`;

        documents.push({
          id,
          text: page.text,
          metadata: {
            source: sourceId,
            mimeType: 'application/pdf',
            pageCount: result.pageCount,
            page: page.pageNumber,
            totalPages: result.pageCount,
            title: result.metadata?.title,
            createdAt: result.metadata?.creationDate
              ? new Date(result.metadata.creationDate)
              : undefined,
          },
        });
      }
    } else {
      // Create a single document with all text
      this.documentCounter++;
      const id = options?.generateId ? options.generateId(source, 0) : sourceId;

      documents.push({
        id,
        text: result.text,
        metadata: {
          source: sourceId,
          mimeType: 'application/pdf',
          pageCount: result.pageCount,
          title: result.metadata?.title,
          createdAt: result.metadata?.creationDate
            ? new Date(result.metadata.creationDate)
            : undefined,
        },
      });
    }

    return documents;
  }
}

/**
 * Create a PDF loader instance.
 *
 * @param options - Loader options
 * @returns PDFLoader instance
 */
export function createPDFLoader(options?: PDFLoaderOptions): PDFLoader {
  return new PDFLoader(options);
}
