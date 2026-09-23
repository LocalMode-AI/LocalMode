/**
 * PDF.js Runtime Selection
 *
 * Picks the PDF.js build and the document parameters that suit the host
 * runtime. Browsers get the default build; Node.js gets the `legacy` build.
 *
 * @packageDocumentation
 */

/** The shape of the PDF.js module, taken from the default build's types. */
export type PDFJSModule = typeof import('pdfjs-dist');

/**
 * Whether the current runtime is Node.js.
 *
 * This mirrors the detection PDF.js itself performs, including the
 * `[object process]` stringification test: bundlers commonly inject a partial
 * `process` shim into browser builds, and only that test tells such a shim
 * apart from the real thing. A DOM-emulating test environment such as jsdom
 * runs on Node and is correctly reported as Node here.
 */
export function isNodeRuntime(): boolean {
  // Read off globalThis so the package needs no Node type definitions.
  const proc = (globalThis as { process?: { versions?: { node?: string } } }).process;

  return (
    typeof proc === 'object' &&
    proc !== null &&
    Object.prototype.toString.call(proc) === '[object process]' &&
    typeof proc.versions?.node === 'string'
  );
}

/**
 * Load the PDF.js build that matches the host runtime.
 *
 * Node.js gets `pdfjs-dist/legacy/build/pdf.mjs`. The default build calls
 * `Map.prototype.getOrInsertComputed`, which browsers ship but Node does not
 * expose through Node 25; on the default build `getDocument().getMetadata()`
 * therefore throws a `TypeError` in Node. The legacy build carries the
 * polyfill, and PDF.js documents it as the supported Node.js build.
 *
 * Each branch is its own dynamic import so a browser bundler resolves the
 * default build eagerly and leaves the legacy build in a separate chunk that
 * the browser branch never fetches.
 *
 * @returns The PDF.js module for this runtime.
 */
export async function loadPDFJS(): Promise<PDFJSModule> {
  if (isNodeRuntime()) {
    return (await import('pdfjs-dist/legacy/build/pdf.mjs')) as PDFJSModule;
  }
  return import('pdfjs-dist');
}

/**
 * Extra `getDocument()` parameters required by the host runtime.
 *
 * PDF.js derives `useSystemFonts` from its own Node detection, defaulting it
 * to `true` in browsers and `false` in Node. With it `false`, a document that
 * references one of the standard 14 fonts without embedding it makes PDF.js
 * fetch font files from `standardFontDataUrl`, and with no such URL it reports
 * `UnknownErrorException: Ensure that the 'standardFontDataUrl' API parameter
 * is provided`. Requesting `true` in Node selects the same font-substitution
 * path browsers already take, so both runtimes extract text the same way
 * without shipping font files.
 *
 * @returns Parameters to spread into the `getDocument()` argument object.
 */
export function runtimeDocumentParams(): { useSystemFonts?: boolean } {
  return isNodeRuntime() ? { useSystemFonts: true } : {};
}
