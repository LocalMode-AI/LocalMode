/**
 * @localmode/pdfjs Real-PDF Tests
 *
 * Exercises the package's public exports against real, byte-level PDF input
 * parsed by the bundled pdfjs-dist. Nothing here is mocked: `extractPDFText`,
 * `getPDFPageCount`, `isPDF` and `PDFLoader` all run the actual PDF.js parser.
 *
 * The fixtures are hand-encoded PDF 1.4 files built in-test, so the suite is
 * deterministic and needs no binary assets on disk.
 *
 * @packageDocumentation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  extractPDFText,
  getPDFPageCount,
  isPDF,
  PDFLoader,
  createPDFLoader,
  type LoadedPDFDocument,
} from '../src/index.js';
import { isNodeRuntime, runtimeDocumentParams } from '../src/runtime.js';
import { pdfDocumentMetadata } from '../src/loader.js';

/** Escapes the characters that are special inside a PDF literal string. */
function escapePdfString(value: string): string {
  return value.replace(/([\\()])/g, '\\$1');
}

interface BuildPdfOptions {
  /** One entry per page; each entry is the list of text lines on that page. */
  pages: string[][];
  /** Optional document information dictionary entries. */
  info?: {
    Title?: string;
    Author?: string;
    Subject?: string;
    Keywords?: string;
    Producer?: string;
    Creator?: string;
    CreationDate?: string;
    ModDate?: string;
  };
}

/**
 * Hand-encodes a minimal, valid, multi-page text PDF (PDF 1.4): catalog →
 * pages → page objects with a shared Helvetica font and one content stream
 * each. The cross-reference table offsets are computed from the emitted bytes,
 * so the result parses in strict readers.
 */
function buildPdf({ pages, info }: BuildPdfOptions): Uint8Array {
  // Object layout: 1 = catalog, 2 = page tree, 3 = font, then per page a page
  // object and a content stream, then an optional /Info dictionary.
  const pageObjStart = 4;
  const bodies: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '', // page tree — filled in once the kid object numbers are known
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  const kids: number[] = [];
  pages.forEach((lines, pageIndex) => {
    const pageObj = pageObjStart + pageIndex * 2;
    const contentObj = pageObj + 1;
    kids.push(pageObj);

    let content = 'BT\n/F1 18 Tf\n72 700 Td\n';
    lines.forEach((line, lineIndex) => {
      if (lineIndex > 0) content += '0 -24 Td\n';
      content += `(${escapePdfString(line)}) Tj\n`;
    });
    content += 'ET';

    bodies.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
        `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObj} 0 R >>`
    );
    bodies.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  bodies[1] = `<< /Type /Pages /Kids [${kids.map((n) => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>`;

  let infoRef = '';
  if (info) {
    const entries: string[] = [];
    if (info.Title) entries.push(`/Title (${escapePdfString(info.Title)})`);
    if (info.Author) entries.push(`/Author (${escapePdfString(info.Author)})`);
    if (info.Subject) entries.push(`/Subject (${escapePdfString(info.Subject)})`);
    if (info.Keywords) entries.push(`/Keywords (${escapePdfString(info.Keywords)})`);
    if (info.Producer) entries.push(`/Producer (${escapePdfString(info.Producer)})`);
    if (info.Creator) entries.push(`/Creator (${escapePdfString(info.Creator)})`);
    if (info.CreationDate) entries.push(`/CreationDate (${info.CreationDate})`);
    if (info.ModDate) entries.push(`/ModDate (${info.ModDate})`);
    bodies.push(`<< ${entries.join(' ')} >>`);
    infoRef = ` /Info ${bodies.length} 0 R`;
  }

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  bodies.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R${infoRef} >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  // Everything emitted above is ASCII, so a byte-per-char copy is exact.
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) {
    bytes[i] = pdf.charCodeAt(i) & 0xff;
  }
  return bytes;
}

const ONE_PAGE_LINES = [
  'LocalMode processes documents entirely',
  'in the browser using WebAssembly',
];

const TWO_PAGE_LINES = [
  ['Vector search runs on device', 'with no server round trip'],
  ['Embeddings never leave the browser', 'and are stored in IndexedDB'],
];

const singlePagePdf = () => buildPdf({ pages: [ONE_PAGE_LINES] });
const twoPagePdf = () => buildPdf({ pages: TWO_PAGE_LINES });

describe('extractPDFText (real PDF.js)', () => {
  it('extracts the real text of a single-page PDF', async () => {
    const result = await extractPDFText(singlePagePdf());

    expect(result.pageCount).toBe(1);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].pageNumber).toBe(1);
    expect(result.pages[0].text).toBe(
      'LocalMode processes documents entirely\nin the browser using WebAssembly'
    );
    expect(result.text).toBe(
      '[Page 1]\nLocalMode processes documents entirely\nin the browser using WebAssembly'
    );
  });

  it('extracts every page of a multi-page PDF and joins them with the separator', async () => {
    const result = await extractPDFText(twoPagePdf(), { includePageNumbers: false });

    expect(result.pageCount).toBe(2);
    expect(result.pages.map((p) => p.pageNumber)).toEqual([1, 2]);
    expect(result.pages[0].text).toBe('Vector search runs on device\nwith no server round trip');
    expect(result.pages[1].text).toBe(
      'Embeddings never leave the browser\nand are stored in IndexedDB'
    );
    expect(result.text).toBe(`${result.pages[0].text}\n\n---\n\n${result.pages[1].text}`);
  });

  it('honours includePageNumbers and a custom pageSeparator', async () => {
    const result = await extractPDFText(twoPagePdf(), {
      includePageNumbers: true,
      pageSeparator: '\n<<SPLIT>>\n',
    });

    expect(result.text).toContain('[Page 1]\n');
    expect(result.text).toContain('[Page 2]\n');
    expect(result.text).toContain('\n<<SPLIT>>\n');
  });

  it('stops after maxPages while still reporting the true page count', async () => {
    const result = await extractPDFText(twoPagePdf(), { maxPages: 1 });

    expect(result.pageCount).toBe(2);
    expect(result.pages).toHaveLength(1);
    expect(result.text).not.toContain('Embeddings never leave the browser');
  });

  it('reads the document information dictionary', async () => {
    const pdf = buildPdf({
      pages: [ONE_PAGE_LINES],
      info: {
        Title: 'LocalMode Handbook',
        Author: 'LocalMode',
        CreationDate: "D:20260115093000+00'00'",
      },
    });

    const result = await extractPDFText(pdf);

    expect(result.metadata?.title).toBe('LocalMode Handbook');
    expect(result.metadata?.author).toBe('LocalMode');
    expect(result.metadata?.creationDate).toBeInstanceOf(Date);
    expect(result.metadata?.creationDate?.getFullYear()).toBe(2026);
    expect(result.metadataError).toBeUndefined();
  });

  // The metadata path runs whichever PDF.js build was selected for the host
  // runtime, and this file installs nothing to help it. On Node the default
  // build's `getMetadata()` throws a TypeError because it calls
  // `Map.prototype.getOrInsertComputed`, which Node does not expose through
  // version 25; the legacy build ships that built-in with it. Reading real
  // field values here is therefore a witness that the legacy build was loaded.
  it('reads metadata through the build selected for this runtime', async () => {
    const result = await extractPDFText(
      buildPdf({ pages: [ONE_PAGE_LINES], info: { Title: 'Runtime Check' } })
    );

    expect(result.metadata?.title).toBe('Runtime Check');
    expect(result.metadataError).toBeUndefined();
    // The built-in the default build needs is present once PDF.js has loaded,
    // supplied by the legacy build rather than by this suite.
    expect(typeof (Map.prototype as { getOrInsertComputed?: unknown }).getOrInsertComputed).toBe(
      'function'
    );
  });

  it('reports no metadataError for a document that carries no /Info dictionary', async () => {
    const result = await extractPDFText(buildPdf({ pages: [ONE_PAGE_LINES] }));

    // metadataError means "reading it failed", never "there was none to read".
    expect(result.metadataError).toBeUndefined();
    expect(result.metadata?.title).toBeUndefined();
  });

  it('accepts a Blob source', async () => {
    const blob = new Blob([singlePagePdf()], { type: 'application/pdf' });
    const result = await extractPDFText(blob);

    expect(result.pages[0].text).toContain('LocalMode processes documents entirely');
  });

  it('accepts an ArrayBuffer source', async () => {
    const bytes = singlePagePdf();
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
    const result = await extractPDFText(buffer);

    expect(result.pages[0].text).toContain('in the browser using WebAssembly');
  });

  it('rejects when the abort signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      extractPDFText(singlePagePdf(), { abortSignal: controller.signal })
    ).rejects.toThrow();
  });

  it('rejects data that is not a PDF', async () => {
    const notAPdf = new TextEncoder().encode('this is plain text, not a PDF');

    await expect(extractPDFText(notAPdf)).rejects.toThrow();
  });
});

describe('PDF date parsing (real PDF.js)', () => {
  // Pin the process to a zone far from UTC with no daylight saving, so a date
  // read as local time instead of UTC is visible on any host.
  const originalTZ = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'Asia/Tokyo';
  });

  afterAll(() => {
    if (originalTZ === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTZ;
    }
  });

  async function readDates(CreationDate: string, ModDate?: string) {
    const result = await extractPDFText(
      buildPdf({ pages: [ONE_PAGE_LINES], info: { Title: 'Dates', CreationDate, ModDate } })
    );
    expect(result.metadataError).toBeUndefined();
    expect(result.metadata?.title).toBe('Dates');
    return result.metadata!;
  }

  it('runs in a zone offset from UTC', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(-540);
  });

  it('reads a trailing Z as UTC', async () => {
    const metadata = await readDates('D:20260922120000Z', "D:20260922120000Z00'00'");

    expect(metadata.creationDate?.toISOString()).toBe('2026-09-22T12:00:00.000Z');
    expect(metadata.modificationDate?.toISOString()).toBe('2026-09-22T12:00:00.000Z');
  });

  it('applies a positive offset', async () => {
    const metadata = await readDates("D:20260922120000+05'30'");

    expect(metadata.creationDate?.toISOString()).toBe('2026-09-22T06:30:00.000Z');
  });

  it('applies a negative offset, with or without the closing apostrophe', async () => {
    const metadata = await readDates("D:20260922120000-08'00'", "D:20260922120000-08'00");

    expect(metadata.creationDate?.toISOString()).toBe('2026-09-22T20:00:00.000Z');
    expect(metadata.modificationDate?.toISOString()).toBe('2026-09-22T20:00:00.000Z');
  });

  it('applies an offset given in hours only', async () => {
    const metadata = await readDates('D:20260922120000+02');

    expect(metadata.creationDate?.toISOString()).toBe('2026-09-22T10:00:00.000Z');
  });

  it('reads a date without a zone as local time', async () => {
    const metadata = await readDates('D:20260922120000');

    // The PDF leaves the zone unspecified; the reader's local zone is used.
    expect(metadata.creationDate?.getTime()).toBe(new Date(2026, 8, 22, 12, 0, 0).getTime());
    expect(metadata.creationDate?.toISOString()).toBe('2026-09-22T03:00:00.000Z');
  });

  it('fills omitted trailing fields with their earliest value', async () => {
    const metadata = await readDates('D:202609', 'D:2026Z');

    expect(metadata.creationDate?.getTime()).toBe(new Date(2026, 8, 1, 0, 0, 0).getTime());
    expect(metadata.modificationDate?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it.each([
    ['not a date', 'garbage'],
    ['month 13', 'D:20261301000000Z'],
    ['February 30', 'D:20260230000000Z'],
    ['hour 24', 'D:20260922240000Z'],
    ['minute 60', 'D:20260922126000Z'],
    ['offset minute 60', "D:20260922120000+05'60'"],
  ])('returns undefined, never an Invalid Date, for %s', async (_label, value) => {
    const metadata = await readDates(value);

    expect(metadata.creationDate).toBeUndefined();
  });
});

describe('getPDFPageCount (real PDF.js)', () => {
  it('returns the page count without extracting text', async () => {
    await expect(getPDFPageCount(singlePagePdf())).resolves.toBe(1);
    await expect(getPDFPageCount(twoPagePdf())).resolves.toBe(2);
  });
});

describe('isPDF', () => {
  it('recognises real PDF bytes', async () => {
    const bytes = singlePagePdf();

    await expect(isPDF(bytes)).resolves.toBe(true);
    await expect(isPDF(new Blob([bytes], { type: 'application/pdf' }))).resolves.toBe(true);
  });

  it('rejects non-PDF bytes', async () => {
    await expect(isPDF(new TextEncoder().encode('%PNG-not-a-pdf'))).resolves.toBe(false);
  });
});

describe('PDFLoader (real PDF.js)', () => {
  it('declares the DocumentLoader support list', () => {
    expect(new PDFLoader().supports).toEqual(['.pdf', 'application/pdf']);
  });

  it('canLoad() accepts PDF sources and rejects others', () => {
    const loader = new PDFLoader();

    expect(loader.canLoad(new Blob([], { type: 'application/pdf' }))).toBe(true);
    expect(loader.canLoad('report.PDF')).toBe(true);
    expect(loader.canLoad(new Blob([], { type: 'text/plain' }))).toBe(false);
    expect(loader.canLoad('notes.txt')).toBe(false);
  });

  it('loads a real PDF into a single document', async () => {
    const file = new File([twoPagePdf()], 'handbook.pdf', { type: 'application/pdf' });
    const documents = await createPDFLoader().load(file);

    expect(documents).toHaveLength(1);
    expect(documents[0].id).toBe('handbook.pdf');
    expect(documents[0].text).toContain('Vector search runs on device');
    expect(documents[0].text).toContain('Embeddings never leave the browser');
    expect(documents[0].metadata.source).toBe('handbook.pdf');
    expect(documents[0].metadata.mimeType).toBe('application/pdf');
    expect(documents[0].metadata.pageCount).toBe(2);
  });

  it('splits a real PDF into one document per page', async () => {
    const file = new File([twoPagePdf()], 'handbook.pdf', { type: 'application/pdf' });
    const documents = await createPDFLoader({ splitByPage: true }).load(file);

    expect(documents).toHaveLength(2);
    expect(documents.map((d) => d.id)).toEqual(['handbook.pdf-page-1', 'handbook.pdf-page-2']);
    expect(documents[0].text).toBe('Vector search runs on device\nwith no server round trip');
    expect(documents[1].metadata.page).toBe(2);
    expect(documents[1].metadata.totalPages).toBe(2);
  });

  it('propagates the document title from the PDF metadata', async () => {
    const pdf = buildPdf({
      pages: [ONE_PAGE_LINES],
      info: { Title: 'LocalMode Handbook' },
    });
    const file = new File([pdf], 'titled.pdf', { type: 'application/pdf' });
    const documents = await createPDFLoader().load(file);

    expect(documents[0].metadata.title).toBe('LocalMode Handbook');
  });

  it('attaches the full /Info metadata as metadata.pdf on every loaded document', async () => {
    const pdf = buildPdf({
      pages: TWO_PAGE_LINES,
      info: {
        Title: 'LocalMode Handbook',
        Author: 'LocalMode',
        Subject: 'On-device AI',
        Keywords: 'rag, privacy',
        Producer: 'Handwritten',
        Creator: 'real-pdf.test',
        CreationDate: 'D:20260115093000Z',
        ModDate: 'D:20260922120000Z',
      },
    });
    const file = new File([pdf], 'info.pdf', { type: 'application/pdf' });

    const [single] = (await createPDFLoader().load(file)) as LoadedPDFDocument[];
    const pages = (await createPDFLoader({ splitByPage: true }).load(file)) as LoadedPDFDocument[];

    for (const doc of [single, ...pages]) {
      const info = doc.metadata.pdf;
      expect(info?.title).toBe('LocalMode Handbook');
      expect(info?.author).toBe('LocalMode');
      expect(info?.subject).toBe('On-device AI');
      expect(info?.keywords).toBe('rag, privacy');
      expect(info?.producer).toBe('Handwritten');
      expect(info?.creator).toBe('real-pdf.test');
      expect(info?.creationDate?.toISOString()).toBe('2026-01-15T09:30:00.000Z');
      expect(info?.modificationDate?.toISOString()).toBe('2026-09-22T12:00:00.000Z');
    }
    expect(pages).toHaveLength(2);
  });

  it('omits metadataError from loaded documents when the metadata reads fine', async () => {
    const pdf = buildPdf({ pages: TWO_PAGE_LINES, info: { Title: 'Readable' } });
    const file = new File([pdf], 'readable.pdf', { type: 'application/pdf' });

    const [single] = await createPDFLoader().load(file);
    const pages = await createPDFLoader({ splitByPage: true }).load(file);

    expect(single.metadata.title).toBe('Readable');
    expect('metadataError' in single.metadata).toBe(false);
    expect(pages).toHaveLength(2);
    for (const page of pages) {
      expect('metadataError' in page.metadata).toBe(false);
    }
  });

  it('rejects when the abort signal is already aborted', async () => {
    const file = new File([singlePagePdf()], 'aborted.pdf', { type: 'application/pdf' });
    const controller = new AbortController();
    controller.abort();

    await expect(
      createPDFLoader().load(file, { abortSignal: controller.signal })
    ).rejects.toThrow();
  });
});

// PDF.js tolerates a missing, mistyped, or self-referencing /Info entry and a
// malformed XMP stream without throwing from getMetadata(), so a failed
// metadata read (reachable on a PDF.js build/runtime mismatch) cannot be
// produced from a document here. The mapping from an extraction result to
// loader metadata is exercised directly instead, on real extraction output.
describe('pdfDocumentMetadata', () => {
  it('maps a real extraction result without adding metadataError', async () => {
    const result = await extractPDFText(
      buildPdf({
        pages: [ONE_PAGE_LINES],
        info: { Title: 'Mapped', CreationDate: 'D:20260115093000Z' },
      })
    );

    expect(pdfDocumentMetadata(result, 'mapped.pdf')).toEqual({
      source: 'mapped.pdf',
      mimeType: 'application/pdf',
      pageCount: 1,
      title: 'Mapped',
      createdAt: new Date(Date.UTC(2026, 0, 15, 9, 30, 0)),
      pdf: {
        title: 'Mapped',
        author: undefined,
        subject: undefined,
        keywords: undefined,
        creationDate: new Date(Date.UTC(2026, 0, 15, 9, 30, 0)),
        modificationDate: undefined,
        producer: undefined,
        creator: undefined,
      },
    });
  });

  it('forwards metadataError when reading the metadata failed', async () => {
    const extracted = await extractPDFText(buildPdf({ pages: TWO_PAGE_LINES }));
    const failedRead = {
      ...extracted,
      metadata: undefined,
      metadataError: 'getOrInsertComputed is not a function',
    };

    expect(pdfDocumentMetadata(failedRead, 'broken.pdf')).toEqual({
      source: 'broken.pdf',
      mimeType: 'application/pdf',
      pageCount: 2,
      title: undefined,
      createdAt: undefined,
      metadataError: 'getOrInsertComputed is not a function',
    });
    expect('pdf' in pdfDocumentMetadata(failedRead, 'broken.pdf')).toBe(false);
  });
});

describe('runtime selection', () => {
  // Which PDF.js build loads, and whether Node's font-substitution parameter is
  // sent, both hang off this predicate. A browser bundle that carries a partial
  // `process` shim must still be treated as a browser, or it would be handed
  // the Node-only build and parameters.
  function withGlobalProcess<T>(value: unknown, fn: () => T): T {
    const had = Object.prototype.hasOwnProperty.call(globalThis, 'process');
    const original = (globalThis as { process?: unknown }).process;
    Object.defineProperty(globalThis, 'process', { configurable: true, writable: true, value });
    try {
      return fn();
    } finally {
      if (had) {
        Object.defineProperty(globalThis, 'process', {
          configurable: true,
          writable: true,
          value: original,
        });
      } else {
        Reflect.deleteProperty(globalThis, 'process');
      }
    }
  }

  it('reports Node when running on Node', () => {
    expect(isNodeRuntime()).toBe(true);
    expect(runtimeDocumentParams()).toEqual({ useSystemFonts: true });
  });

  it('reports a browser when a bundler injected a partial process shim', () => {
    withGlobalProcess({ env: { NODE_ENV: 'production' }, versions: { node: '25.0.0' } }, () => {
      expect(isNodeRuntime()).toBe(false);
      expect(runtimeDocumentParams()).toEqual({});
    });
  });

  it('reports a browser when there is no process global at all', () => {
    withGlobalProcess(undefined, () => {
      expect(isNodeRuntime()).toBe(false);
      expect(runtimeDocumentParams()).toEqual({});
    });
  });
});
