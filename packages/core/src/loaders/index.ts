/**
 * Document Loaders
 *
 * Production-essential document loading utilities.
 * Zero external dependencies.
 *
 * @packageDocumentation
 */

// Export all types
export * from './types.js';

// Export loaders
export { TextLoader, createTextLoader } from './text.js';
export { JSONLoader, createJSONLoader } from './json.js';
export { CSVLoader, createCSVLoader } from './csv.js';
export { HTMLLoader, createHTMLLoader } from './html.js';

import type { LoaderSource, LoadedDocument, DocumentLoader, LoaderOptions } from './types.js';
import { TextLoader } from './text.js';
import { JSONLoader } from './json.js';
import { CSVLoader } from './csv.js';
import { HTMLLoader } from './html.js';

/**
 * Registry of built-in loaders.
 */
const LOADERS: DocumentLoader<LoaderOptions>[] = [
  new TextLoader(),
  new JSONLoader(),
  new CSVLoader(),
  new HTMLLoader(),
];

/**
 * Auto-detect and load a document using the appropriate loader.
 *
 * @example
 * ```typescript
 * import { loadDocument } from '@localmode/core';
 *
 * // Auto-detect loader based on content/type
 * const docs = await loadDocument(fileOrString);
 *
 * // With specific options
 * const docs = await loadDocument(csvFile, {
 *   loader: 'csv',
 *   textColumn: 'content',
 * });
 * ```
 */
export async function loadDocument(
  source: LoaderSource,
  options?: LoaderOptions & { loader?: 'text' | 'json' | 'csv' | 'html' }
): Promise<LoadedDocument[]> {
  const { loader: loaderType, ...loaderOptions } = options ?? {};

  // Use specified loader if provided
  if (loaderType) {
    const loader = getLoaderByType(loaderType);
    return loader.load(source, loaderOptions);
  }

  // Auto-detect loader
  for (const loader of LOADERS) {
    if (loader.canLoad?.(source)) {
      return loader.load(source, loaderOptions);
    }
  }

  // Default to text loader
  return new TextLoader().load(source, loaderOptions);
}

/**
 * Load multiple documents from multiple sources.
 */
export async function loadDocuments(
  sources: LoaderSource[],
  options?: LoaderOptions & { loader?: 'text' | 'json' | 'csv' | 'html' }
): Promise<LoadedDocument[]> {
  const results = await Promise.all(sources.map((source) => loadDocument(source, options)));
  return results.flat();
}

/**
 * Get a loader by type name.
 */
function getLoaderByType(type: 'text' | 'json' | 'csv' | 'html'): DocumentLoader<LoaderOptions> {
  switch (type) {
    case 'text':
      return new TextLoader();
    case 'json':
      return new JSONLoader();
    case 'csv':
      return new CSVLoader();
    case 'html':
      return new HTMLLoader();
    default:
      throw new Error(`Unknown loader type: ${type}`);
  }
}

/**
 * Create a custom loader registry.
 *
 * @example
 * ```typescript
 * import { createLoaderRegistry, TextLoader, JSONLoader } from '@localmode/core';
 *
 * const registry = createLoaderRegistry([
 *   new TextLoader(),
 *   new JSONLoader(),
 *   // Add custom loaders
 *   new MyPDFLoader(),
 * ]);
 *
 * const docs = await registry.load(source);
 * ```
 */
export function createLoaderRegistry(loaders: DocumentLoader<LoaderOptions>[]): {
  load: (source: LoaderSource, options?: LoaderOptions) => Promise<LoadedDocument[]>;
  loadMany: (sources: LoaderSource[], options?: LoaderOptions) => Promise<LoadedDocument[]>;
  getLoader: (source: LoaderSource) => DocumentLoader<LoaderOptions> | undefined;
  loaders: DocumentLoader<LoaderOptions>[];
} {
  return {
    loaders,

    getLoader(source: LoaderSource): DocumentLoader<LoaderOptions> | undefined {
      return loaders.find((loader) => loader.canLoad?.(source));
    },

    async load(source: LoaderSource, options?: LoaderOptions): Promise<LoadedDocument[]> {
      const loader = this.getLoader(source);
      if (!loader) {
        throw new Error('No loader found for source');
      }
      return loader.load(source, options);
    },

    async loadMany(sources: LoaderSource[], options?: LoaderOptions): Promise<LoadedDocument[]> {
      const results = await Promise.all(sources.map((s) => this.load(s, options)));
      return results.flat();
    },
  };
}
