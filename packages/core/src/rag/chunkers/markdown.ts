/**
 * Markdown-aware text chunker.
 *
 * Intelligently splits markdown documents while preserving:
 * - Header context (includes parent headers in chunks)
 * - Code blocks as single units
 * - Tables as single units
 * - List structure
 *
 * @packageDocumentation
 */

import type { Chunk, MarkdownChunkOptions, ChunkMetadata, CodeLanguage } from '../types.js';
import { DEFAULT_CHUNK_OPTIONS } from '../types.js';

/**
 * Parsed markdown element types.
 */
type MarkdownElementType =
  | 'header'
  | 'paragraph'
  | 'code_block'
  | 'table'
  | 'list'
  | 'blockquote'
  | 'horizontal_rule'
  | 'blank';

/**
 * A parsed markdown element.
 */
interface MarkdownElement {
  type: MarkdownElementType;
  content: string;
  start: number;
  end: number;
  level?: number; // For headers
  language?: string; // For code blocks
  headerPath?: string[]; // Current header context
}

/**
 * Split markdown text into chunks while preserving structure.
 *
 * @param text - Markdown text to split
 * @param options - Chunking configuration
 * @returns Array of chunks with markdown metadata
 *
 * @example
 * ```typescript
 * const chunks = markdownChunk(markdown, {
 *   size: 500,
 *   includeHeaders: true,
 *   preserveCodeBlocks: true,
 * });
 *
 * // Chunks include header context:
 * // chunk.metadata.headerPath = "# Main Title > ## Section"
 * ```
 */
export function markdownChunk(text: string, options: MarkdownChunkOptions = {}): Chunk[] {
  const {
    size = DEFAULT_CHUNK_OPTIONS.size,
    overlap = DEFAULT_CHUNK_OPTIONS.overlap,
    minSize = DEFAULT_CHUNK_OPTIONS.minSize,
    trim = DEFAULT_CHUNK_OPTIONS.trim,
    includeHeaders = true,
    maxHeaderLevel = 3,
    preserveCodeBlocks = true,
    preserveTables = true,
  } = options;

  if (!text || text.length === 0) {
    return [];
  }

  // Parse markdown into elements
  const elements = parseMarkdown(text);

  // Build chunks respecting structure
  const chunks = buildChunks(elements, {
    size,
    overlap,
    minSize,
    trim,
    includeHeaders,
    maxHeaderLevel,
    preserveCodeBlocks,
    preserveTables,
  });

  return chunks;
}

/**
 * Parse markdown into structural elements.
 */
function parseMarkdown(text: string): MarkdownElement[] {
  const elements: MarkdownElement[] = [];
  const lines = text.split('\n');
  let position = 0;
  let i = 0;
  const headerStack: string[] = [];

  while (i < lines.length) {
    const line = lines[i];
    const lineStart = position;

    // Check for code blocks (fenced)
    if (line.startsWith('```') || line.startsWith('~~~')) {
      const fence = line.slice(0, 3);
      const language = line.slice(3).trim();
      const codeStart = position;
      let codeContent = line + '\n';
      position += line.length + 1;
      i++;

      // Find closing fence
      while (i < lines.length && !lines[i].startsWith(fence)) {
        codeContent += lines[i] + '\n';
        position += lines[i].length + 1;
        i++;
      }

      // Include closing fence
      if (i < lines.length) {
        codeContent += lines[i];
        position += lines[i].length + 1;
        i++;
      }

      elements.push({
        type: 'code_block',
        content: codeContent,
        start: codeStart,
        end: position,
        language,
        headerPath: [...headerStack],
      });
      continue;
    }

    // Check for headers
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const headerText = headerMatch[2];

      // Update header stack
      while (headerStack.length >= level) {
        headerStack.pop();
      }
      headerStack.push(`${'#'.repeat(level)} ${headerText}`);

      elements.push({
        type: 'header',
        content: line,
        start: lineStart,
        end: position + line.length,
        level,
        headerPath: [...headerStack],
      });

      position += line.length + 1;
      i++;
      continue;
    }

    // Check for tables
    if (line.includes('|') && i + 1 < lines.length && lines[i + 1].match(/^\|?[\s\-:|]+\|/)) {
      const tableStart = position;
      let tableContent = line + '\n';
      position += line.length + 1;
      i++;

      // Include table rows
      while (i < lines.length && (lines[i].includes('|') || lines[i].match(/^\|?[\s\-:|]+\|/))) {
        tableContent += lines[i] + '\n';
        position += lines[i].length + 1;
        i++;
      }

      elements.push({
        type: 'table',
        content: tableContent.trimEnd(),
        start: tableStart,
        end: position,
        headerPath: [...headerStack],
      });
      continue;
    }

    // Check for horizontal rules
    if (line.match(/^[-*_]{3,}\s*$/)) {
      elements.push({
        type: 'horizontal_rule',
        content: line,
        start: lineStart,
        end: position + line.length,
        headerPath: [...headerStack],
      });
      position += line.length + 1;
      i++;
      continue;
    }

    // Check for blockquotes
    if (line.startsWith('>')) {
      const quoteStart = position;
      let quoteContent = line + '\n';
      position += line.length + 1;
      i++;

      while (
        i < lines.length &&
        (lines[i].startsWith('>') || (lines[i].trim() && !lines[i].match(/^#+\s/)))
      ) {
        if (!lines[i].startsWith('>') && lines[i].trim()) {
          break; // End of blockquote
        }
        quoteContent += lines[i] + '\n';
        position += lines[i].length + 1;
        i++;
      }

      elements.push({
        type: 'blockquote',
        content: quoteContent.trimEnd(),
        start: quoteStart,
        end: position,
        headerPath: [...headerStack],
      });
      continue;
    }

    // Check for lists
    if (line.match(/^[\s]*[-*+]\s/) || line.match(/^[\s]*\d+\.\s/)) {
      const listStart = position;
      let listContent = line + '\n';
      position += line.length + 1;
      i++;

      // Continue while we have list items or indented content
      while (i < lines.length) {
        const nextLine = lines[i];
        if (
          nextLine.match(/^[\s]*[-*+]\s/) ||
          nextLine.match(/^[\s]*\d+\.\s/) ||
          (nextLine.startsWith('  ') && listContent.endsWith('\n'))
        ) {
          listContent += nextLine + '\n';
          position += nextLine.length + 1;
          i++;
        } else if (nextLine.trim() === '') {
          // Blank line might continue the list
          if (
            i + 1 < lines.length &&
            (lines[i + 1].match(/^[\s]*[-*+]\s/) || lines[i + 1].match(/^[\s]*\d+\.\s/))
          ) {
            listContent += nextLine + '\n';
            position += nextLine.length + 1;
            i++;
          } else {
            break;
          }
        } else {
          break;
        }
      }

      elements.push({
        type: 'list',
        content: listContent.trimEnd(),
        start: listStart,
        end: position,
        headerPath: [...headerStack],
      });
      continue;
    }

    // Check for blank lines
    if (line.trim() === '') {
      elements.push({
        type: 'blank',
        content: line,
        start: lineStart,
        end: position + line.length,
        headerPath: [...headerStack],
      });
      position += line.length + 1;
      i++;
      continue;
    }

    // Regular paragraph
    const paraStart = position;
    let paraContent = line + '\n';
    position += line.length + 1;
    i++;

    // Continue paragraph until blank line or structural element
    while (i < lines.length) {
      const nextLine = lines[i];
      if (
        nextLine.trim() === '' ||
        nextLine.match(/^#{1,6}\s/) ||
        nextLine.startsWith('```') ||
        nextLine.startsWith('~~~') ||
        nextLine.match(/^[-*_]{3,}\s*$/) ||
        nextLine.startsWith('>') ||
        nextLine.match(/^[\s]*[-*+]\s/) ||
        nextLine.match(/^[\s]*\d+\.\s/) ||
        (nextLine.includes('|') && i + 1 < lines.length && lines[i + 1]?.match(/^\|?[\s\-:|]+\|/))
      ) {
        break;
      }
      paraContent += nextLine + '\n';
      position += nextLine.length + 1;
      i++;
    }

    elements.push({
      type: 'paragraph',
      content: paraContent.trimEnd(),
      start: paraStart,
      end: position,
      headerPath: [...headerStack],
    });
  }

  return elements;
}

/**
 * Build chunks from parsed elements.
 */
function buildChunks(
  elements: MarkdownElement[],
  options: {
    size: number;
    overlap: number;
    minSize: number;
    trim: boolean;
    includeHeaders: boolean;
    maxHeaderLevel: number;
    preserveCodeBlocks: boolean;
    preserveTables: boolean;
  }
): Chunk[] {
  const chunks: Chunk[] = [];
  let currentChunk = '';
  let currentStart = -1;
  let currentHeaders: string[] = [];
  let chunkIndex = 0;

  const finalizeChunk = () => {
    if (currentChunk.length >= options.minSize) {
      const text = options.trim ? currentChunk.trim() : currentChunk;
      if (text.length >= options.minSize) {
        const metadata: ChunkMetadata = {};

        if (currentHeaders.length > 0) {
          metadata.headerPath = currentHeaders.join(' > ');
          metadata.headerLevels = currentHeaders.map((h) => {
            const match = h.match(/^(#+)/);
            return match ? match[1].length : 0;
          });
        }

        chunks.push({
          text,
          start: currentStart,
          end: currentStart + currentChunk.length,
          index: chunkIndex++,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        });
      }
    }
    currentChunk = '';
    currentStart = -1;
  };

  for (const element of elements) {
    // Skip blank lines
    if (element.type === 'blank') {
      continue;
    }

    // Update header context
    if (element.headerPath && element.headerPath.length > 0) {
      currentHeaders = element.headerPath.filter((h) => {
        const level = (h.match(/^(#+)/) || ['', ''])[1].length;
        return level <= options.maxHeaderLevel;
      });
    }

    // Handle elements that should be preserved as single units
    if (
      (element.type === 'code_block' && options.preserveCodeBlocks) ||
      (element.type === 'table' && options.preserveTables)
    ) {
      // Finalize current chunk first
      if (currentChunk) {
        finalizeChunk();
      }

      // Add as its own chunk (even if larger than target size)
      const metadata: ChunkMetadata = {
        headerPath: currentHeaders.length > 0 ? currentHeaders.join(' > ') : undefined,
        isCodeBlock: element.type === 'code_block',
        isTable: element.type === 'table',
      };

      if (element.type === 'code_block' && element.language) {
        metadata.language = element.language as CodeLanguage;
      }

      chunks.push({
        text: options.trim ? element.content.trim() : element.content,
        start: element.start,
        end: element.end,
        index: chunkIndex++,
        metadata,
      });
      continue;
    }

    // Headers start new chunks if includeHeaders is true
    if (element.type === 'header' && options.includeHeaders) {
      if (currentChunk) {
        finalizeChunk();
      }
      currentChunk = element.content;
      currentStart = element.start;
      continue;
    }

    // Check if adding this element would exceed target size
    const elementContent = element.content;
    const newLength = currentChunk.length + (currentChunk ? 2 : 0) + elementContent.length;

    if (newLength > options.size && currentChunk.length > 0) {
      // Finalize current chunk
      finalizeChunk();

      // Start new chunk with header context if enabled
      if (options.includeHeaders && currentHeaders.length > 0) {
        currentChunk = currentHeaders.join('\n\n') + '\n\n' + elementContent;
      } else {
        currentChunk = elementContent;
      }
      currentStart = element.start;
    } else {
      // Add to current chunk
      if (currentChunk) {
        currentChunk += '\n\n' + elementContent;
      } else {
        currentChunk = elementContent;
        currentStart = element.start;
      }
    }
  }

  // Finalize last chunk
  if (currentChunk) {
    finalizeChunk();
  }

  // Fallback: if no chunks were created but we had content, return the whole text as one chunk
  // This handles small documents that don't meet minSize but shouldn't be discarded
  if (chunks.length === 0 && elements.length > 0) {
    const allContent = elements
      .filter((e) => e.type !== 'blank')
      .map((e) => e.content)
      .join('\n\n');

    if (allContent.trim().length > 0) {
      const headerPath = elements.find((e) => e.headerPath && e.headerPath.length > 0)?.headerPath;
      const metadata: ChunkMetadata = {};

      if (headerPath && headerPath.length > 0) {
        metadata.headerPath = headerPath.join(' > ');
      }

      chunks.push({
        text: options.trim ? allContent.trim() : allContent,
        start: 0,
        end: allContent.length,
        index: 0,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      });
    }
  }

  return chunks;
}

/**
 * Create a markdown chunker with preset options.
 */
export function createMarkdownChunker(
  defaultOptions: MarkdownChunkOptions = {}
): (text: string, options?: MarkdownChunkOptions) => Chunk[] {
  return (text: string, options: MarkdownChunkOptions = {}) =>
    markdownChunk(text, { ...defaultOptions, ...options });
}
