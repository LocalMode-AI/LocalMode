/**
 * JSON Document Loader
 *
 * Loader for JSON documents, extracting text from specified fields.
 * Zero external dependencies.
 *
 * @packageDocumentation
 */

import type { DocumentLoader, LoaderSource, LoadedDocument, LoadedDocumentMetadata, JSONLoaderOptions } from './types.js';

/**
 * Generate a unique document ID.
 */
function generateId(): string {
  return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Get a value from an object using a dot-notation path.
 */
function getValueByPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof current === 'object' && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[part];
    } else if (Array.isArray(current)) {
      const index = parseInt(part, 10);
      if (!isNaN(index) && index >= 0 && index < current.length) {
        current = current[index];
      } else {
        return undefined;
      }
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Extract all string values from an object recursively.
 */
function extractAllStrings(obj: unknown, maxDepth = 10): string[] {
  const strings: string[] = [];

  function traverse(value: unknown, depth: number): void {
    if (depth > maxDepth) return;

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed && trimmed.length > 0) {
        strings.push(trimmed);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) {
        traverse(item, depth + 1);
      }
    } else if (value !== null && typeof value === 'object') {
      for (const key of Object.keys(value as Record<string, unknown>)) {
        traverse((value as Record<string, unknown>)[key], depth + 1);
      }
    }
  }

  traverse(obj, 0);
  return strings;
}

/**
 * JSON document loader.
 *
 * Loads documents from JSON, extracting text from specified fields.
 *
 * @example
 * ```typescript
 * import { JSONLoader } from '@localmode/core';
 *
 * // Extract from specific fields
 * const loader = new JSONLoader({
 *   textFields: ['content', 'description'],
 * });
 * const docs = await loader.load(jsonString);
 *
 * // Load array of records
 * const arrayLoader = new JSONLoader({
 *   recordsPath: 'data.items',
 *   textFields: ['text'],
 * });
 *
 * // Extract all strings
 * const allStringsLoader = new JSONLoader({
 *   extractAllStrings: true,
 * });
 * ```
 */
export class JSONLoader implements DocumentLoader<JSONLoaderOptions> {
  readonly supports = ['.json', 'application/json', 'text/json'];

  /**
   * Check if this loader can handle the source.
   */
  canLoad(source: LoaderSource): boolean {
    if (typeof source === 'string') {
      // Basic heuristic: starts with { or [
      const trimmed = source.trim();
      return trimmed.startsWith('{') || trimmed.startsWith('[');
    }
    if (source instanceof File) {
      return source.name.endsWith('.json') || source.type === 'application/json';
    }
    if (source instanceof Blob) {
      return source.type === 'application/json' || source.type === 'text/json';
    }
    return false;
  }

  /**
   * Load documents from JSON source.
   */
  async load(source: LoaderSource, options: JSONLoaderOptions = {}): Promise<LoadedDocument[]> {
    const {
      generateId: customGenerateId,
      textFields,
      extractAllStrings: extractAll = false,
      fieldSeparator = '\n',
      recordsPath,
      abortSignal,
    } = options;

    // Check for cancellation
    abortSignal?.throwIfAborted();

    // Get JSON content
    const jsonString = await this.getText(source, options);

    // Parse JSON
    let data: unknown;
    try {
      data = JSON.parse(jsonString);
    } catch (error) {
      throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }

    // If recordsPath is provided, navigate to that path
    let records: unknown[];
    if (recordsPath) {
      const value = getValueByPath(data, recordsPath);
      if (Array.isArray(value)) {
        records = value;
      } else if (value !== undefined) {
        records = [value];
      } else {
        records = [];
      }
    } else if (Array.isArray(data)) {
      records = data;
    } else {
      records = [data];
    }

    // Process each record
    const documents: LoadedDocument[] = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];

      // Extract text
      let text: string;
      if (extractAll) {
        const strings = extractAllStrings(record);
        text = strings.join(fieldSeparator);
      } else if (textFields && textFields.length > 0) {
        const values: string[] = [];
        for (const field of textFields) {
          const value = getValueByPath(record, field);
          if (typeof value === 'string') {
            values.push(value.trim());
          } else if (value !== undefined && value !== null) {
            values.push(String(value));
          }
        }
        text = values.filter(Boolean).join(fieldSeparator);
      } else {
        // Default: look for common text fields
        const commonFields = ['text', 'content', 'body', 'description', 'message', 'title'];
        const values: string[] = [];
        for (const field of commonFields) {
          const value = getValueByPath(record, field);
          if (typeof value === 'string' && value.trim()) {
            values.push(value.trim());
            break; // Use first found
          }
        }
        if (values.length === 0) {
          // Fall back to stringifying the record
          text = JSON.stringify(record, null, 2);
        } else {
          text = values.join(fieldSeparator);
        }
      }

      if (!text.trim()) {
        continue;
      }

      // Generate ID
      let id: string;
      if (customGenerateId) {
        id = customGenerateId(source, i);
      } else {
        // Try to use 'id' field from record
        const recordId = typeof record === 'object' && record !== null 
          ? (record as Record<string, unknown>).id ?? (record as Record<string, unknown>)._id
          : undefined;
        if (typeof recordId === 'string' || typeof recordId === 'number') {
          id = String(recordId);
        } else {
          id = generateId();
        }
      }

      // Build metadata
      const metadata: LoadedDocumentMetadata = {
        source: this.getSourceName(source),
        mimeType: 'application/json',
        recordIndex: i,
      };

      // Add some record fields to metadata (excluding large text)
      if (typeof record === 'object' && record !== null) {
        for (const [key, value] of Object.entries(record as Record<string, unknown>)) {
          if (
            !textFields?.includes(key) &&
            key !== 'text' &&
            key !== 'content' &&
            key !== 'body' &&
            (typeof value === 'string' ? value.length < 200 : true) &&
            (typeof value !== 'object' || value === null)
          ) {
            metadata[key] = value;
          }
        }
      }

      documents.push({
        id,
        text: text.trim(),
        metadata,
      });
    }

    return documents;
  }

  /**
   * Get text content from source.
   */
  private async getText(source: LoaderSource, options: JSONLoaderOptions): Promise<string> {
    const { encoding = 'utf-8', maxSize, abortSignal } = options;

    if (typeof source === 'string') {
      if (maxSize && source.length > maxSize) {
        throw new Error(`JSON exceeds maximum size: ${source.length} > ${maxSize}`);
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

    throw new Error('Unsupported source type for JSONLoader');
  }

  /**
   * Get source name for metadata.
   */
  private getSourceName(source: LoaderSource): string {
    if (typeof source === 'string') return 'json-string';
    if (source instanceof File) return source.name;
    if (source instanceof Blob) return 'json-blob';
    if (typeof source === 'object' && 'type' in source && source.type === 'url') {
      return source.url;
    }
    return 'json';
  }
}

/**
 * Create a JSON loader with default options.
 */
export function createJSONLoader(_options?: JSONLoaderOptions): JSONLoader {
  return new JSONLoader();
}
