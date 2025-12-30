/**
 * Text Document Loader
 *
 * Loader for plain text documents.
 * Zero external dependencies.
 *
 * @packageDocumentation
 */

import type { DocumentLoader, LoaderSource, LoadedDocument, LoadedDocumentMetadata, TextLoaderOptions } from './types.js';

/**
 * Generate a unique document ID.
 */
function generateId(): string {
  return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Text document loader.
 *
 * Loads plain text documents from strings, files, or blobs.
 *
 * @example
 * ```typescript
 * import { TextLoader } from '@localmode/core';
 *
 * const loader = new TextLoader();
 * const docs = await loader.load('Hello, world!');
 * console.log(docs[0].text); // 'Hello, world!'
 *
 * // With separator (splits into multiple documents)
 * const multiLoader = new TextLoader({ separator: '\n\n' });
 * const paragraphs = await multiLoader.load('Para 1\n\nPara 2');
 * console.log(paragraphs.length); // 2
 * ```
 */
export class TextLoader implements DocumentLoader<TextLoaderOptions> {
  readonly supports = ['.txt', '.text', 'text/plain'];

  /**
   * Check if this loader can handle the source.
   */
  canLoad(source: LoaderSource): boolean {
    if (typeof source === 'string') {
      return true;
    }
    if (source instanceof File) {
      return (
        source.name.endsWith('.txt') ||
        source.name.endsWith('.text') ||
        source.type === 'text/plain'
      );
    }
    if (source instanceof Blob) {
      return source.type === 'text/plain' || source.type === '';
    }
    return false;
  }

  /**
   * Load documents from text source.
   */
  async load(source: LoaderSource, options: TextLoaderOptions = {}): Promise<LoadedDocument[]> {
    const { generateId: customGenerateId, separator, trim = true, abortSignal } = options;

    // Check for cancellation
    abortSignal?.throwIfAborted();

    // Get text content
    let text = await this.getText(source, options);

    // Apply trimming
    if (trim) {
      text = text.trim();
    }

    if (!text) {
      return [];
    }

    // Split if separator is provided
    if (separator) {
      const parts = text.split(separator);
      const documents: LoadedDocument[] = [];

      for (let index = 0; index < parts.length; index++) {
        const content = trim ? parts[index].trim() : parts[index];
        if (!content) continue;

        const id = customGenerateId ? customGenerateId(source, index) : generateId();
        const metadata: LoadedDocumentMetadata = {
          source: this.getSourceName(source),
          mimeType: 'text/plain',
          partIndex: index,
          totalParts: parts.length,
        };

        documents.push({ id, text: content, metadata });
      }

      return documents;
    }

    // Single document
    const id = customGenerateId ? customGenerateId(source, 0) : generateId();
    const metadata: LoadedDocumentMetadata = {
      source: this.getSourceName(source),
      mimeType: 'text/plain',
      length: text.length,
    };

    return [{ id, text, metadata }];
  }

  /**
   * Get text content from source.
   */
  private async getText(source: LoaderSource, options: TextLoaderOptions): Promise<string> {
    const { encoding = 'utf-8', maxSize, abortSignal } = options;

    if (typeof source === 'string') {
      if (maxSize && source.length > maxSize) {
        throw new Error(`Text exceeds maximum size: ${source.length} > ${maxSize}`);
      }
      return source;
    }

    if (source instanceof Blob || source instanceof File) {
      if (maxSize && source.size > maxSize) {
        throw new Error(`File exceeds maximum size: ${source.size} > ${maxSize}`);
      }
      return source.text();
    }

    if (source instanceof ArrayBuffer) {
      if (maxSize && source.byteLength > maxSize) {
        throw new Error(`Buffer exceeds maximum size: ${source.byteLength} > ${maxSize}`);
      }
      const decoder = new TextDecoder(encoding);
      return decoder.decode(source);
    }

    if (typeof source === 'object' && 'type' in source && source.type === 'url') {
      const response = await fetch(source.url, { signal: abortSignal });
      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
      }
      return response.text();
    }

    throw new Error('Unsupported source type for TextLoader');
  }

  /**
   * Get source name for metadata.
   */
  private getSourceName(source: LoaderSource): string {
    if (typeof source === 'string') return 'text-string';
    if (source instanceof File) return source.name;
    if (source instanceof Blob) return 'text-blob';
    if (typeof source === 'object' && 'type' in source && source.type === 'url') {
      return source.url;
    }
    return 'text';
  }
}

/**
 * Create a text loader with default options.
 */
export function createTextLoader(_options?: TextLoaderOptions): TextLoader {
  return new TextLoader();
}
