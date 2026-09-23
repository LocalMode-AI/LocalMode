# @localmode/pdfjs

PDF text extraction for local-first document processing. Uses PDF.js, in the browser and in Node.js.

[![npm](https://img.shields.io/npm/v/@localmode/pdfjs)](https://www.npmjs.com/package/@localmode/pdfjs)
[![license](https://img.shields.io/npm/l/@localmode/pdfjs)](../../LICENSE)

[![Docs](https://img.shields.io/badge/Docs-LocalMode.dev-red)](https://localmode.dev/docs/pdfjs)
[![UI Components](https://img.shields.io/badge/UI_Components-LocalMode.ai-green)](https://localmode.ai)
[![Blocks & Apps](https://img.shields.io/badge/Blocks_&_Apps-LocalMode.ai-purple)](https://localmode.ai/blocks)

## Installation

```bash
pnpm install @localmode/pdfjs @localmode/core
```

## Quick Start

```typescript
import { extractPDFText } from '@localmode/pdfjs';

// From a file input
const file = document.getElementById('file').files[0];
const { text, pageCount } = await extractPDFText(file);

console.log(`Extracted ${pageCount} pages`);
console.log(text);
```

## With Document Loader

`PDFLoader` implements core's `DocumentLoader` interface. Call its `load()` method directly; it returns `LoadedDocument[]` (`{ id, text, metadata }`). Core's `loadDocument()` auto-detects only the built-in text, JSON, HTML, and CSV loaders, so it does not route PDFs to `PDFLoader`. To auto-route, add `PDFLoader` to a `createLoaderRegistry([...])` from `@localmode/core`.

```typescript
import { PDFLoader } from '@localmode/pdfjs';

const loader = new PDFLoader();
const documents = await loader.load(pdfBlob);

for (const doc of documents) {
  console.log(doc.text);
}
```

## Split by Page

```typescript
import { PDFLoader } from '@localmode/pdfjs';

// Each page becomes a separate document
const loader = new PDFLoader({ splitByPage: true });
const documents = await loader.load(pdfBlob);

console.log(`Loaded ${documents.length} pages`);

for (const doc of documents) {
  console.log(`Page ${doc.metadata.page}: ${doc.text.substring(0, 100)}...`);
}
```

## RAG Pipeline Integration

```typescript
import { PDFLoader } from '@localmode/pdfjs';
import { ingest, createVectorDB } from '@localmode/core';
import { transformers } from '@localmode/transformers';

// Setup
const db = await createVectorDB({ name: 'docs', dimensions: 384 });
const model = transformers.embedding('Xenova/bge-small-en-v1.5');
const loader = new PDFLoader({ splitByPage: true });

// Load and ingest PDF (ingest() chunks, embeds, and stores)
const documents = await loader.load(pdfBlob);

await ingest({
  db,
  model,
  documents: documents.map((d) => ({
    text: d.text,
    metadata: d.metadata,
  })),
});

console.log('PDF ingested successfully!');
```

## API Reference

### `extractPDFText(source, options?)`

Extract text from a PDF file.

```typescript
const { text, pageCount, pages, metadata, metadataError } = await extractPDFText(pdfBlob, {
  maxPages: 10, // Limit pages
  includePageNumbers: true, // Add [Page N] headers
  pageSeparator: '\n\n---\n\n', // Between pages (default)
  password: 'secret', // For encrypted PDFs
  abortSignal: controller.signal, // Cancel between pages
});
```

`source` is a `Blob`/`File`, `ArrayBuffer`, `Uint8Array`, or a URL string.

Metadata is optional, so a PDF whose information dictionary cannot be read still returns its text: `metadata` is then absent and `metadataError` holds the reason (it is also logged with `console.warn`). A PDF that simply has no `/Info` dictionary returns a `metadata` object whose fields are all `undefined`, and no `metadataError`.

`metadata` carries `title`, `author`, `subject`, `keywords`, `producer`, `creator`, and `creationDate`/`modificationDate` as `Date`s. PDF dates (`D:YYYYMMDDHHmmSSOHH'mm'`) are read with their zone: `Z` is UTC, `+HH'mm'`/`-HH'mm'` offsets are applied, and a date with no zone is local time. A malformed or impossible date (month 13, February 30) gives `undefined`, never an Invalid Date.

### `PDFLoader`

DocumentLoader implementation for PDFs.

```typescript
const loader = new PDFLoader({
  splitByPage: false, // Single document vs per-page
  pageSeparator: '\n\n---\n\n', // Between pages when not split
  maxPages: undefined, // All pages
  includePageNumbers: true,
  password: undefined,
});
```

Each document's metadata has `source`, `mimeType: 'application/pdf'`, `pageCount`, `title`, and `createdAt`; split pages add `page` and `totalPages`. When the PDF's information dictionary could not be read, `metadataError` is forwarded as well (absent otherwise). `load(source, { abortSignal })` is cancellable.

### `getPDFPageCount(source)`

Get page count without full extraction.

```typescript
const pageCount = await getPDFPageCount(pdfBlob);
```

### `isPDF(source)`

Check if a file is a PDF.

```typescript
if (await isPDF(file)) {
  // Handle PDF
}
```

## Runtime Support

This package depends on `pdfjs-dist` 6, which requires **Chrome 125+ / Safari 18+** in the browser and **Node.js 22.13+** for server-side extraction.

- **Browser**: loads PDF.js's default build; the worker is fetched from jsDelivr (`pdfjs-dist@<version>/build/pdf.worker.min.mjs`) unless you set `GlobalWorkerOptions.workerSrc` yourself.
- **Node.js**: loads PDF.js's `legacy` build (`pdfjs-dist/legacy/build/pdf.mjs`), the build PDF.js supports for Node, and requests `useSystemFonts: true` so non-embedded standard fonts extract the same text as in a browser. DOM-emulating test environments such as jsdom run on Node and take this path.

The build is selected automatically; there is nothing to configure.

## Acknowledgments

This package is built on [PDF.js](https://mozilla.github.io/pdf.js/) by [Mozilla](https://mozilla.org/) — an open-source PDF rendering and text extraction library.

## License

[MIT](../../LICENSE)
