/**
 * HTML Document Loader
 *
 * Loader for HTML documents, extracting text content.
 * Zero external dependencies - uses DOMParser in browser and regex fallback.
 *
 * @packageDocumentation
 */

import type { DocumentLoader, LoaderSource, LoadedDocument, LoadedDocumentMetadata, HTMLLoaderOptions } from './types.js';

/**
 * Generate a unique document ID.
 */
function generateId(): string {
  return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Default tags to ignore (scripts, styles, etc.)
 */
const DEFAULT_IGNORE_TAGS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'svg',
  'canvas',
  'video',
  'audio',
  'object',
  'embed',
  'applet',
  'head',
  'meta',
  'link',
  'template',
];

/**
 * Simple HTML parser for environments without DOM.
 * Strips tags and extracts text content.
 */
function parseHTMLWithRegex(
  html: string,
  options: {
    selector?: string;
    ignoreTags?: string[];
    preserveFormatting?: boolean;
  }
): { text: string; title?: string; metadata: Record<string, string> } {
  const ignoreTags = options.ignoreTags ?? DEFAULT_IGNORE_TAGS;

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : undefined;

  // Extract meta tags for metadata
  const metadata: Record<string, string> = {};
  const metaRegex = /<meta\s+(?:[^>]*?\s+)?(?:name|property)=["']([^"']+)["'][^>]*?content=["']([^"']+)["'][^>]*>/gi;
  let metaMatch;
  while ((metaMatch = metaRegex.exec(html)) !== null) {
    metadata[metaMatch[1]] = metaMatch[2];
  }

  // If selector is provided, try to extract that content
  let content = html;
  if (options.selector) {
    // Simple selector support: id, class, or tag
    const selectorRegex = createSelectorRegex(options.selector);
    if (selectorRegex) {
      const selectorMatch = html.match(selectorRegex);
      if (selectorMatch) {
        content = selectorMatch[0];
      }
    }
  }

  // Remove ignored tags and their content
  for (const tag of ignoreTags) {
    const tagRegex = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    content = content.replace(tagRegex, '');
    // Also remove self-closing versions
    content = content.replace(new RegExp(`<${tag}[^>]*\\/>`, 'gi'), '');
  }

  // Remove comments
  content = content.replace(/<!--[\s\S]*?-->/g, '');

  // Handle formatting preservation
  if (options.preserveFormatting) {
    // Replace block elements with newlines
    content = content.replace(/<\/(p|div|h[1-6]|li|tr|br|hr)[^>]*>/gi, '\n');
    content = content.replace(/<br\s*\/?>/gi, '\n');
    content = content.replace(/<hr\s*\/?>/gi, '\n---\n');
    content = content.replace(/<li[^>]*>/gi, '\n• ');
  }

  // Remove all remaining HTML tags
  content = content.replace(/<[^>]+>/g, ' ');

  // Decode HTML entities
  content = decodeHTMLEntities(content);

  // Normalize whitespace
  if (options.preserveFormatting) {
    // Preserve paragraph breaks but normalize spaces within lines
    content = content
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter((line) => line)
      .join('\n');
  } else {
    content = content.replace(/\s+/g, ' ').trim();
  }

  return { text: content, title, metadata };
}

/**
 * Create a regex to match an HTML element by selector.
 */
function createSelectorRegex(selector: string): RegExp | null {
  // ID selector: #id
  if (selector.startsWith('#')) {
    const id = selector.slice(1);
    return new RegExp(`<[^>]+\\s+id=["']${id}["'][^>]*>[\\s\\S]*?<\\/[^>]+>`, 'i');
  }

  // Class selector: .class
  if (selector.startsWith('.')) {
    const className = selector.slice(1);
    return new RegExp(
      `<[^>]+\\s+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>[\\s\\S]*?<\\/[^>]+>`,
      'i'
    );
  }

  // Tag selector
  return new RegExp(`<${selector}[^>]*>[\\s\\S]*?<\\/${selector}>`, 'i');
}

/**
 * Decode common HTML entities.
 */
function decodeHTMLEntities(text: string): string {
  const entities: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&ndash;': '–',
    '&mdash;': '—',
    '&lsquo;': '\u2018',
    '&rsquo;': '\u2019',
    '&ldquo;': '\u201C',
    '&rdquo;': '\u201D',
    '&hellip;': '…',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
    '&euro;': '€',
    '&pound;': '£',
    '&yen;': '¥',
    '&cent;': '¢',
  };

  let result = text;
  for (const [entity, char] of Object.entries(entities)) {
    result = result.replace(new RegExp(entity, 'gi'), char);
  }

  // Decode numeric entities
  result = result.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
  result = result.replace(/&#x([a-fA-F0-9]+);/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );

  return result;
}

/**
 * Parse HTML using DOMParser if available, otherwise use regex.
 */
function parseHTML(
  html: string,
  options: HTMLLoaderOptions
): { text: string; title?: string; metadata: Record<string, string> } {
  // Try to use DOMParser if available (browser environment)
  if (typeof DOMParser !== 'undefined') {
    try {
      return parseHTMLWithDOM(html, options);
    } catch {
      // Fall back to regex if DOMParser fails
    }
  }

  return parseHTMLWithRegex(html, options);
}

/**
 * Parse HTML using DOMParser (browser).
 */
function parseHTMLWithDOM(
  html: string,
  options: HTMLLoaderOptions
): { text: string; title?: string; metadata: Record<string, string> } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Extract title
  const title = doc.querySelector('title')?.textContent?.trim();

  // Extract metadata from meta tags
  const metadata: Record<string, string> = {};
  const metaTags = doc.querySelectorAll('meta[name], meta[property]');
  metaTags.forEach((meta) => {
    const name =
      meta.getAttribute('name') || meta.getAttribute('property');
    const content = meta.getAttribute('content');
    if (name && content) {
      metadata[name] = content;
    }
  });

  // Remove ignored tags
  const ignoreTags = options.ignoreTags ?? DEFAULT_IGNORE_TAGS;
  for (const tag of ignoreTags) {
    const elements = doc.querySelectorAll(tag);
    elements.forEach((el) => el.remove());
  }

  // Get content from selector or body
  let content: string;
  if (options.selector) {
    const element = doc.querySelector(options.selector);
    content = element?.textContent ?? '';
  } else if (options.selectors && options.selectors.length > 0) {
    const texts: string[] = [];
    for (const selector of options.selectors) {
      const element = doc.querySelector(selector);
      if (element?.textContent) {
        texts.push(element.textContent);
      }
    }
    content = texts.join('\n\n');
  } else {
    content = doc.body?.textContent ?? '';
  }

  // Normalize whitespace
  if (options.preserveFormatting) {
    content = content
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter((line) => line)
      .join('\n');
  } else {
    content = content.replace(/\s+/g, ' ').trim();
  }

  return { text: content, title, metadata };
}

/**
 * HTML document loader.
 *
 * Loads documents from HTML, extracting text content.
 * Supports CSS selectors for targeting specific content.
 *
 * @example
 * ```typescript
 * import { HTMLLoader } from '@localmode/core';
 *
 * // Load entire page
 * const loader = new HTMLLoader();
 * const docs = await loader.load(htmlText);
 *
 * // Extract specific content
 * const articleLoader = new HTMLLoader({
 *   selector: 'article.content',
 *   preserveFormatting: true,
 * });
 *
 * // Extract metadata
 * const metaLoader = new HTMLLoader({
 *   extractMetadata: true,
 * });
 * ```
 */
export class HTMLLoader implements DocumentLoader<HTMLLoaderOptions> {
  readonly supports = ['.html', '.htm', 'text/html', 'application/xhtml+xml'];

  /**
   * Check if this loader can handle the source.
   */
  canLoad(source: LoaderSource): boolean {
    if (typeof source === 'string') {
      // Check for HTML tags
      return /<html|<!doctype|<head|<body/i.test(source);
    }
    if (source instanceof File) {
      return source.name.endsWith('.html') || source.name.endsWith('.htm');
    }
    if (source instanceof Blob) {
      return source.type === 'text/html' || source.type === 'application/xhtml+xml';
    }
    return false;
  }

  /**
   * Load documents from HTML source.
   */
  async load(source: LoaderSource, options: HTMLLoaderOptions = {}): Promise<LoadedDocument[]> {
    const { generateId: customGenerateId, abortSignal, extractMetadata = true } = options;

    // Check for cancellation
    abortSignal?.throwIfAborted();

    // Get HTML text
    const html = await this.getText(source, options);

    // Parse HTML
    const { text, title, metadata: htmlMetadata } = parseHTML(html, options);

    if (!text.trim()) {
      return [];
    }

    // Generate ID
    let id: string;
    if (customGenerateId) {
      id = customGenerateId(source, 0);
    } else if (title) {
      // Create slug from title
      id = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50);
    } else {
      id = generateId();
    }

    // Build metadata
    const metadata: LoadedDocumentMetadata = {
      source: this.getSourceName(source),
      mimeType: 'text/html',
    };

    if (title) {
      metadata.title = title;
    }

    if (extractMetadata) {
      // Add common meta fields
      if (htmlMetadata.description) {
        metadata.description = htmlMetadata.description;
      }
      if (htmlMetadata['og:title']) {
        metadata.ogTitle = htmlMetadata['og:title'];
      }
      if (htmlMetadata['og:description']) {
        metadata.ogDescription = htmlMetadata['og:description'];
      }
      if (htmlMetadata['og:image']) {
        metadata.ogImage = htmlMetadata['og:image'];
      }
      if (htmlMetadata.author) {
        metadata.author = htmlMetadata.author;
      }
      if (htmlMetadata.keywords) {
        metadata.keywords = htmlMetadata.keywords;
      }
    }

    return [{ id, text, metadata }];
  }

  /**
   * Get text content from source.
   */
  private async getText(source: LoaderSource, options: HTMLLoaderOptions): Promise<string> {
    const { encoding = 'utf-8', maxSize, abortSignal } = options;

    if (typeof source === 'string') {
      if (maxSize && source.length > maxSize) {
        throw new Error(`HTML exceeds maximum size: ${source.length} > ${maxSize}`);
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

    throw new Error('Unsupported source type for HTMLLoader');
  }

  /**
   * Get source name for metadata.
   */
  private getSourceName(source: LoaderSource): string {
    if (typeof source === 'string') return 'html-string';
    if (source instanceof File) return source.name;
    if (source instanceof Blob) return 'html-blob';
    if (typeof source === 'object' && 'type' in source && source.type === 'url') {
      return source.url;
    }
    return 'html';
  }
}

/**
 * Create an HTML loader with default options.
 */
export function createHTMLLoader(_options?: HTMLLoaderOptions): HTMLLoader {
  return new HTMLLoader();
}

