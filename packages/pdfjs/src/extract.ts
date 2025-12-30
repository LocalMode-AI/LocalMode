/**
 * PDF Text Extraction
 *
 * Functions for extracting text from PDF files using PDF.js.
 *
 * @packageDocumentation
 */

import type {
  PDFExtractOptions,
  PDFExtractResult,
  PDFPageContent,
  PDFMetadata,
} from './types.js';

// Dynamic import types for pdfjs-dist
type PDFDocumentProxy = import('pdfjs-dist').PDFDocumentProxy;

/**
 * Extract text from a PDF file.
 *
 * @param source - PDF source (Blob, ArrayBuffer, URL, or Uint8Array)
 * @param options - Extraction options
 * @returns Promise with extracted text and metadata
 *
 * @example From Blob
 * ```ts
 * import { extractPDFText } from '@localmode/pdfjs';
 *
 * const file = document.getElementById('file').files[0];
 * const { text, pageCount } = await extractPDFText(file);
 * console.log(`Extracted ${pageCount} pages: ${text.substring(0, 100)}...`);
 * ```
 *
 * @example From URL
 * ```ts
 * const { text } = await extractPDFText('/documents/report.pdf');
 * ```
 *
 * @example With options
 * ```ts
 * const { pages } = await extractPDFText(pdfBlob, {
 *   maxPages: 10,
 *   includePageNumbers: true,
 * });
 *
 * for (const page of pages) {
 *   console.log(`Page ${page.pageNumber}: ${page.text.substring(0, 50)}...`);
 * }
 * ```
 */
export async function extractPDFText(
  source: Blob | ArrayBuffer | Uint8Array | string,
  options: PDFExtractOptions = {}
): Promise<PDFExtractResult> {
  const {
    includePageNumbers = true,
    pageSeparator = '\n\n---\n\n',
    maxPages,
    password,
    abortSignal,
  } = options;

  abortSignal?.throwIfAborted();

  // Dynamically import pdfjs-dist
  const pdfjs = await import('pdfjs-dist');

  // Set up worker
  if (typeof window !== 'undefined') {
    // In browser, use the bundled worker
    pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
  }

  abortSignal?.throwIfAborted();

  // Prepare source data
  let data: ArrayBuffer | Uint8Array | string;
  if (source instanceof Blob) {
    data = new Uint8Array(await source.arrayBuffer());
  } else if (source instanceof ArrayBuffer) {
    data = new Uint8Array(source);
  } else {
    data = source;
  }

  abortSignal?.throwIfAborted();

  // Load PDF document
  const loadingTask = pdfjs.getDocument({
    data: typeof data === 'string' ? undefined : data,
    url: typeof data === 'string' ? data : undefined,
    password,
  });

  // Handle abort
  if (abortSignal) {
    abortSignal.addEventListener('abort', () => {
      loadingTask.destroy();
    });
  }

  const pdf = await loadingTask.promise;

  abortSignal?.throwIfAborted();

  // Extract metadata
  const metadata = await extractMetadata(pdf);

  // Extract text from each page
  const pageCount = pdf.numPages;
  const pagesToExtract = maxPages ? Math.min(maxPages, pageCount) : pageCount;

  const pages: PDFPageContent[] = [];

  for (let i = 1; i <= pagesToExtract; i++) {
    abortSignal?.throwIfAborted();

    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    let pageText = '';
    for (const item of textContent.items) {
      if ('str' in item) {
        pageText += item.str;
        // Add space or newline based on transform
        if ('hasEOL' in item && item.hasEOL) {
          pageText += '\n';
        } else {
          pageText += ' ';
        }
      }
    }

    pages.push({
      pageNumber: i,
      text: pageText.trim(),
    });
  }

  // Combine text
  let fullText = '';
  for (let i = 0; i < pages.length; i++) {
    if (includePageNumbers) {
      fullText += `[Page ${pages[i].pageNumber}]\n`;
    }
    fullText += pages[i].text;
    if (i < pages.length - 1) {
      fullText += pageSeparator;
    }
  }

  return {
    text: fullText,
    pageCount,
    pages,
    metadata,
  };
}

/**
 * Extract metadata from a PDF document.
 */
async function extractMetadata(pdf: PDFDocumentProxy): Promise<PDFMetadata | undefined> {
  try {
    const metadata = await pdf.getMetadata();

    if (!metadata.info) {
      return undefined;
    }

    const info = metadata.info as Record<string, unknown>;

    return {
      title: typeof info.Title === 'string' ? info.Title : undefined,
      author: typeof info.Author === 'string' ? info.Author : undefined,
      subject: typeof info.Subject === 'string' ? info.Subject : undefined,
      keywords: typeof info.Keywords === 'string' ? info.Keywords : undefined,
      producer: typeof info.Producer === 'string' ? info.Producer : undefined,
      creator: typeof info.Creator === 'string' ? info.Creator : undefined,
      creationDate: parsePDFDate(info.CreationDate as string | undefined),
      modificationDate: parsePDFDate(info.ModDate as string | undefined),
    };
  } catch {
    return undefined;
  }
}

/**
 * Parse a PDF date string to a Date object.
 */
function parsePDFDate(dateStr: string | undefined): Date | undefined {
  if (!dateStr) {
    return undefined;
  }

  // PDF dates are in the format: D:YYYYMMDDHHmmSSOHH'mm'
  const match = dateStr.match(
    /D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([+-Z])?(\d{2})?'?(\d{2})?/
  );

  if (!match) {
    return undefined;
  }

  const [
    ,
    year,
    month = '01',
    day = '01',
    hour = '00',
    minute = '00',
    second = '00',
  ] = match;

  return new Date(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hour),
    parseInt(minute),
    parseInt(second)
  );
}

/**
 * Get the number of pages in a PDF without extracting text.
 *
 * @param source - PDF source
 * @returns Promise with page count
 */
export async function getPDFPageCount(
  source: Blob | ArrayBuffer | Uint8Array | string
): Promise<number> {
  const pdfjs = await import('pdfjs-dist');

  let data: ArrayBuffer | Uint8Array | string;
  if (source instanceof Blob) {
    data = new Uint8Array(await source.arrayBuffer());
  } else if (source instanceof ArrayBuffer) {
    data = new Uint8Array(source);
  } else {
    data = source;
  }

  const loadingTask = pdfjs.getDocument({
    data: typeof data === 'string' ? undefined : data,
    url: typeof data === 'string' ? data : undefined,
  });

  const pdf = await loadingTask.promise;
  return pdf.numPages;
}

/**
 * Check if a file is a PDF based on magic bytes.
 *
 * @param source - File source
 * @returns Promise<boolean> indicating if the file is a PDF
 */
export async function isPDF(
  source: Blob | ArrayBuffer | Uint8Array
): Promise<boolean> {
  let bytes: Uint8Array;

  if (source instanceof Blob) {
    bytes = new Uint8Array(await source.slice(0, 5).arrayBuffer());
  } else if (source instanceof ArrayBuffer) {
    bytes = new Uint8Array(source.slice(0, 5));
  } else {
    bytes = source.slice(0, 5);
  }

  // PDF magic bytes: %PDF-
  return (
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  );
}

