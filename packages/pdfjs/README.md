# @localmode/pdfjs

PDF text extraction for local-first document processing. Uses PDF.js for efficient browser-based PDF parsing.

[![npm](https://img.shields.io/npm/v/@localmode/pdfjs)](https://www.npmjs.com/package/@localmode/pdfjs)
[![license](https://img.shields.io/npm/l/@localmode/pdfjs)](../../LICENSE)

## Installation

```bash
# Preferred: pnpm
pnpm install @localmode/pdfjs @localmode/core pdfjs-dist

# Alternative: npm
npm install @localmode/pdfjs @localmode/core pdfjs-dist
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

```typescript
import { PDFLoader } from '@localmode/pdfjs';
import { loadDocument } from '@localmode/core';

const loader = new PDFLoader();
const { documents } = await loadDocument(loader, pdfBlob);

for (const doc of documents) {
  console.log(doc.text);
}
```

## Split by Page

```typescript
import { PDFLoader } from '@localmode/pdfjs';
import { loadDocument } from '@localmode/core';

// Each page becomes a separate document
const loader = new PDFLoader({ splitByPage: true });
const { documents } = await loadDocument(loader, pdfBlob);

console.log(`Loaded ${documents.length} pages`);

for (const doc of documents) {
  console.log(`Page ${doc.metadata.page}: ${doc.text.substring(0, 100)}...`);
}
```

## RAG Pipeline Integration

```typescript
import { PDFLoader } from '@localmode/pdfjs';
import { loadDocument, chunk, ingest, createVectorDB } from '@localmode/core';
import { transformers } from '@localmode/transformers';

// Setup
const db = await createVectorDB({ name: 'docs', dimensions: 384 });
const model = transformers.embedding('Xenova/all-MiniLM-L6-v2');
const loader = new PDFLoader({ splitByPage: true });

// Load and ingest PDF
const { documents } = await loadDocument(loader, pdfBlob);

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
const { text, pageCount, pages, metadata } = await extractPDFText(pdfBlob, {
  maxPages: 10, // Limit pages
  includePageNumbers: true, // Add [Page N] headers
  pageSeparator: '\n---\n', // Between pages
  password: 'secret', // For encrypted PDFs
});
```

### `PDFLoader`

DocumentLoader implementation for PDFs.

```typescript
const loader = new PDFLoader({
  splitByPage: false, // Single document vs per-page
  maxPages: undefined, // All pages
  includePageNumbers: true,
  password: undefined,
});
```

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

## License

[MIT](../../LICENSE)
