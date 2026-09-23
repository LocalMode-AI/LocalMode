# @localmode/pdfjs

## 2.1.0

### Minor Changes

- security: `pdfjs-dist` `^5.5.207` → `^6.3.289`. PDF.js 5.6.83 through 6.2.107 execute arbitrary JavaScript when a malicious PDF is opened (GHSA-hq66-cqwq-w95j; the `isEvalSupported` path, removed in 6.x). The old caret range let any fresh install resolve the vulnerable 5.7.x line. The public API is unchanged: `extractPDFText`, `getPDFPageCount`, `isPDF` and `PDFLoader` keep their signatures, `getDocument` was already called with a parameter object, and the browser still loads its worker from `pdfjs-dist@<version>/build/pdf.worker.min.mjs`.
- fix: `/CreationDate` and `/ModDate` values with a `Z` zone were read as local time, and `+HH'mm'` / `-HH'mm'` offsets were ignored (the zone matcher was a character range from `+` to `Z`). `Z` is UTC and offsets are applied; hours-only offsets and a missing closing apostrophe are accepted; out-of-range fields and impossible days such as February 30 give `undefined` instead of rolling into the next month; a date with no zone is still local time, now documented. Tests pin `TZ` so a local-versus-UTC mix-up shows on any machine.
- `PDFLoader` forwards `metadataError` as `metadata.metadataError` when extraction reports one (absent otherwise), and builds each page document's metadata separately so split pages no longer share one `Date` object.
- `LoadedPDFDocument.metadata.pdf` is now filled with the document's `/Info` metadata (it was declared but never set); absent when reading the dictionary failed, alongside `metadataError`.
- Runtime floors that come with PDF.js 6: Node `>=22.13` for Node-side extraction (Node 20 dropped), Chrome 125+ / Safari 18+ in the browser. Browser bundles are otherwise unaffected; the `legacy/` build is still shipped.
- fix: on Node.js the package now loads PDF.js's `legacy` build (`src/runtime.ts`). The default build calls `Map.prototype.getOrInsertComputed`, which browsers ship but Node does not expose through Node 25, so `getMetadata()` threw a `TypeError` there and every document came back with `metadata: undefined`; PDF.js also printed `Warning: Please use the 'legacy' build in Node.js environments.` The legacy build carries that built-in. Browsers are unaffected — they keep the default build, and the legacy build sits in a separate chunk the browser branch never fetches. A DOM-emulating test environment such as jsdom runs on Node and is treated as Node.
- fix: Node requests `useSystemFonts: true`. PDF.js defaults that flag to `true` in browsers and `false` in Node; with it `false`, a document referencing one of the standard 14 fonts without embedding it made PDF.js look for font files and report `UnknownErrorException: Ensure that the 'standardFontDataUrl' API parameter is provided`. Node now takes the same font-substitution path browsers already take, so both runtimes extract text identically and no font files are shipped.
- fix: a metadata failure is no longer swallowed. `extractPDFText()` still returns text when a document's information dictionary cannot be read — metadata is optional — but the reason is now reported on the new `PDFExtractResult.metadataError` and warned about once, instead of disappearing into a bare `catch`. `metadataError` means "reading it failed", never "there was none to read".
- test: a real-PDF suite (`tests/real-pdf.test.ts`, 39 cases) runs the public exports against hand-encoded PDF 1.4 fixtures built in-test: exact text for 1- and 2-page documents, page separators and numbering, `maxPages`, `/Info` metadata and PDF date zones, Blob/ArrayBuffer/Uint8Array sources, abort, non-PDF rejection, and `PDFLoader` with `splitByPage`. The previous suite was mocks only. The metadata cases run against whichever build the runtime selects, with no built-ins installed by the suite, so they fail if the wrong build is loaded.

## 2.0.1

### Patch Changes

- docs: replace the README "Demo" badge with "UI Components" (localmode.ai) and add a "Blocks & Apps" badge linking to the localmode.ai/blocks gallery

## 2.0.0

### Major Changes

- Enhanced PDF text extraction capabilities

### Patch Changes

- Updated dependencies
  - @localmode/core@2.0.0

## 1.0.2

### Patch Changes

- bump to v1.0.2
- Updated dependencies
  - @localmode/core@1.0.2

## 1.0.1

### Patch Changes

- d311bd7: update package metadata and readme files
- Updated dependencies [d311bd7]
  - @localmode/core@1.0.1
