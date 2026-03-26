/**
 * Multimodal Content Utilities
 *
 * Helpers for working with `string | ContentPart[]` message content.
 *
 * @packageDocumentation
 */

import type { ContentPart, TextPart } from './types.js';

/**
 * Normalize message content to `ContentPart[]`.
 *
 * Converts a plain string to a single-element `TextPart` array.
 * Passes `ContentPart[]` through unchanged.
 *
 * @param content - String or ContentPart array to normalize
 * @returns ContentPart array
 *
 * @example
 * ```ts
 * normalizeContent('Hello');
 * // [{ type: 'text', text: 'Hello' }]
 *
 * normalizeContent([{ type: 'text', text: 'Hi' }, { type: 'image', data: '...', mimeType: 'image/png' }]);
 * // returns input unchanged
 * ```
 */
export function normalizeContent(content: string | ContentPart[]): ContentPart[] {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }
  return content;
}

/**
 * Extract the text content from `string | ContentPart[]`.
 *
 * For strings, returns the string directly.
 * For `ContentPart[]`, concatenates all `TextPart` text values
 * (space-separated) and ignores non-text parts.
 *
 * @param content - String or ContentPart array
 * @returns The extracted text content
 *
 * @example
 * ```ts
 * getTextContent('Hello world');
 * // 'Hello world'
 *
 * getTextContent([
 *   { type: 'text', text: 'Describe' },
 *   { type: 'image', data: '...', mimeType: 'image/png' },
 *   { type: 'text', text: 'this image' },
 * ]);
 * // 'Describe this image'
 * ```
 */
export function getTextContent(content: string | ContentPart[]): string {
  if (typeof content === 'string') {
    return content;
  }
  return content
    .filter((part): part is TextPart => part.type === 'text')
    .map((part) => part.text)
    .join(' ');
}
