/**
 * @localmode/pdfjs
 *
 * PDF text extraction for local-first document processing.
 * Uses PDF.js for efficient browser-based PDF parsing.
 *
 * @packageDocumentation
 */

// Loader
export { PDFLoader, createPDFLoader } from './loader.js';

// Extraction functions
export { extractPDFText, getPDFPageCount, isPDF } from './extract.js';

// Types
export type {
  PDFExtractOptions,
  PDFExtractResult,
  PDFPageContent,
  PDFMetadata,
  PDFLoaderOptions,
  LoadedPDFDocument,
} from './types.js';

