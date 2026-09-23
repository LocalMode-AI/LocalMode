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
import { isNodeRuntime, loadPDFJS, runtimeDocumentParams } from './runtime.js';

// Dynamic import types for pdfjs-dist
type PDFDocumentProxy = import('pdfjs-dist').PDFDocumentProxy;

/** Outcome of reading a document's information dictionary. */
interface MetadataOutcome {
  metadata?: PDFMetadata;
  metadataError?: string;
}

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

  // Load the PDF.js build that matches this runtime
  const pdfjs = await loadPDFJS();

  // Set up worker using jsDelivr CDN (has all pdfjs-dist versions, unlike cdnjs)
  if (!isNodeRuntime() && typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
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
    ...runtimeDocumentParams(),
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
  const { metadata, metadataError } = await extractMetadata(pdf);

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
    metadataError,
  };
}

/**
 * Extract metadata from a PDF document.
 *
 * A document's information dictionary is optional, and a document that cannot
 * supply one is still worth extracting text from, so a failure here does not
 * fail the extraction. It is never discarded silently either: the reason is
 * reported on `metadataError` and warned about once.
 */
async function extractMetadata(pdf: PDFDocumentProxy): Promise<MetadataOutcome> {
  let metadata: Awaited<ReturnType<PDFDocumentProxy['getMetadata']>>;

  try {
    metadata = await pdf.getMetadata();
  } catch (error) {
    const metadataError = error instanceof Error ? error.message : String(error);
    console.warn(`[@localmode/pdfjs] Could not read PDF metadata: ${metadataError}`);
    return { metadataError };
  }

  if (!metadata.info) {
    return {};
  }

  const info = metadata.info as Record<string, unknown>;

  return {
    metadata: {
      title: typeof info.Title === 'string' ? info.Title : undefined,
      author: typeof info.Author === 'string' ? info.Author : undefined,
      subject: typeof info.Subject === 'string' ? info.Subject : undefined,
      keywords: typeof info.Keywords === 'string' ? info.Keywords : undefined,
      producer: typeof info.Producer === 'string' ? info.Producer : undefined,
      creator: typeof info.Creator === 'string' ? info.Creator : undefined,
      creationDate: parsePDFDate(info.CreationDate as string | undefined),
      modificationDate: parsePDFDate(info.ModDate as string | undefined),
    },
  };
}

/**
 * Parse a PDF date string to a Date object.
 *
 * PDF dates have the form `D:YYYYMMDDHHmmSSOHH'mm'` (ISO 32000-1, 7.9.4), where
 * every field after the year is optional and `O` is `Z` (UTC), `+` or `-`
 * followed by the offset of local time from UTC. Without `O` the zone is
 * unspecified and the date is read as local time. Returns `undefined` for a
 * string that is not a valid date, never an Invalid Date.
 */
function parsePDFDate(dateStr: string | undefined): Date | undefined {
  if (!dateStr) {
    return undefined;
  }

  const match = dateStr.match(
    /D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:([Zz+-])(?:(\d{2})'?(?:(\d{2})'?)?)?)?/
  );

  if (!match) {
    return undefined;
  }

  const [
    ,
    yearStr,
    monthStr = '01',
    dayStr = '01',
    hourStr = '00',
    minuteStr = '00',
    secondStr = '00',
    zone,
    offsetHourStr = '00',
    offsetMinuteStr = '00',
  ] = match;

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);
  const second = parseInt(secondStr, 10);
  const offsetHour = parseInt(offsetHourStr, 10);
  const offsetMinute = parseInt(offsetMinuteStr, 10);

  if (
    month < 1 || month > 12 ||
    day < 1 ||
    hour > 23 || minute > 59 || second > 59 ||
    offsetHour > 23 || offsetMinute > 59
  ) {
    return undefined;
  }

  // Reject days past the end of the month (e.g. February 30), which Date
  // would otherwise roll over into the next month.
  const calendarDay = new Date(Date.UTC(year, month - 1, day));
  if (calendarDay.getUTCMonth() !== month - 1 || calendarDay.getUTCDate() !== day) {
    return undefined;
  }

  if (zone === undefined) {
    return new Date(year, month - 1, day, hour, minute, second);
  }

  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  if (zone === 'Z' || zone === 'z') {
    return new Date(utcMs);
  }

  const offsetMs = (offsetHour * 60 + offsetMinute) * 60_000;
  return new Date(zone === '+' ? utcMs - offsetMs : utcMs + offsetMs);
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
  const pdfjs = await loadPDFJS();

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
    ...runtimeDocumentParams(),
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

