/**
 * PDF.js Types
 *
 * Types for the PDF.js integration.
 *
 * @packageDocumentation
 */

import type { LoadedDocument, LoadedDocumentMetadata } from '@localmode/core';

/**
 * Options for extracting text from a PDF.
 */
export interface PDFExtractOptions {
  /**
   * Whether to include page numbers in the output.
   * @default true
   */
  includePageNumbers?: boolean;

  /**
   * Separator between pages.
   * @default '\n\n---\n\n'
   */
  pageSeparator?: string;

  /**
   * Maximum pages to extract (undefined = all pages).
   */
  maxPages?: number;

  /**
   * Password for encrypted PDFs.
   */
  password?: string;

  /**
   * AbortSignal for cancellation.
   */
  abortSignal?: AbortSignal;
}

/**
 * Result of PDF text extraction.
 */
export interface PDFExtractResult {
  /** Extracted text content */
  text: string;

  /** Number of pages in the PDF */
  pageCount: number;

  /** Text content per page */
  pages: PDFPageContent[];

  /** PDF metadata */
  metadata?: PDFMetadata;
}

/**
 * Content of a single PDF page.
 */
export interface PDFPageContent {
  /** Page number (1-indexed) */
  pageNumber: number;

  /** Text content of the page */
  text: string;
}

/**
 * PDF document metadata.
 */
export interface PDFMetadata {
  /** Document title */
  title?: string;

  /** Document author */
  author?: string;

  /** Document subject */
  subject?: string;

  /** Document keywords */
  keywords?: string;

  /** Creation date */
  creationDate?: Date;

  /** Modification date */
  modificationDate?: Date;

  /** PDF producer */
  producer?: string;

  /** PDF creator application */
  creator?: string;
}

/**
 * Options for the PDF loader.
 */
export interface PDFLoaderOptions {
  /**
   * Whether to split by page.
   * If true, each page becomes a separate document.
   * @default false
   */
  splitByPage?: boolean;

  /**
   * Page separator for combined text.
   * @default '\n\n---\n\n'
   */
  pageSeparator?: string;

  /**
   * Maximum pages to load.
   */
  maxPages?: number;

  /**
   * Password for encrypted PDFs.
   */
  password?: string;

  /**
   * Include page numbers in metadata.
   * @default true
   */
  includePageNumbers?: boolean;
}

/**
 * Loaded PDF document with metadata.
 */
export interface LoadedPDFDocument extends LoadedDocument {
  metadata: LoadedDocumentMetadata & {
    /** Page number (if split by page) */
    page?: number;

    /** Total pages in the PDF */
    totalPages?: number;

    /** PDF-specific metadata */
    pdf?: PDFMetadata;
  };
}

