/**
 * Code-aware text chunker.
 *
 * Intelligently splits source code while preserving:
 * - Function/class boundaries
 * - Import statements
 * - Comment blocks
 * - Logical code structure
 *
 * @packageDocumentation
 */

import type { Chunk, CodeChunkOptions, CodeLanguage, ChunkMetadata } from '../types.js';
import { DEFAULT_CHUNK_OPTIONS } from '../types.js';

/**
 * Language-specific patterns for code parsing.
 */
interface LanguagePatterns {
  /** Pattern to detect function definitions */
  functionPattern: RegExp;
  /** Pattern to detect class definitions */
  classPattern: RegExp;
  /** Pattern to detect import statements */
  importPattern: RegExp;
  /** Single-line comment prefix */
  singleLineComment: string;
  /** Multi-line comment start */
  multiLineCommentStart: string;
  /** Multi-line comment end */
  multiLineCommentEnd: string;
  /** Block delimiters */
  blockStart: string;
  blockEnd: string;
}

/**
 * Language patterns for supported languages.
 */
const LANGUAGE_PATTERNS: Record<CodeLanguage, LanguagePatterns> = {
  javascript: {
    functionPattern:
      /^[\s]*(async\s+)?function\s+\w+|^[\s]*(const|let|var)\s+\w+\s*=\s*(async\s+)?\(|^[\s]*(const|let|var)\s+\w+\s*=\s*(async\s+)?function/,
    classPattern: /^[\s]*class\s+\w+/,
    importPattern: /^[\s]*(import|export)\s+/,
    singleLineComment: '//',
    multiLineCommentStart: '/*',
    multiLineCommentEnd: '*/',
    blockStart: '{',
    blockEnd: '}',
  },
  typescript: {
    functionPattern:
      /^[\s]*(async\s+)?function\s+\w+|^[\s]*(const|let|var)\s+\w+\s*[:=]\s*(async\s+)?\(|^[\s]*(const|let|var)\s+\w+\s*=\s*(async\s+)?function|^[\s]*(public|private|protected)?\s*(async\s+)?\w+\s*\(/,
    classPattern: /^[\s]*(abstract\s+)?class\s+\w+|^[\s]*interface\s+\w+|^[\s]*type\s+\w+\s*=/,
    importPattern: /^[\s]*(import|export)\s+/,
    singleLineComment: '//',
    multiLineCommentStart: '/*',
    multiLineCommentEnd: '*/',
    blockStart: '{',
    blockEnd: '}',
  },
  python: {
    functionPattern: /^[\s]*(async\s+)?def\s+\w+/,
    classPattern: /^[\s]*class\s+\w+/,
    importPattern: /^[\s]*(import|from)\s+/,
    singleLineComment: '#',
    multiLineCommentStart: '"""',
    multiLineCommentEnd: '"""',
    blockStart: ':',
    blockEnd: '', // Python uses indentation
  },
  java: {
    functionPattern: /^[\s]*(public|private|protected)?\s*(static)?\s*\w+\s+\w+\s*\(/,
    classPattern: /^[\s]*(public|private|protected)?\s*(abstract|final)?\s*class\s+\w+/,
    importPattern: /^[\s]*(import|package)\s+/,
    singleLineComment: '//',
    multiLineCommentStart: '/*',
    multiLineCommentEnd: '*/',
    blockStart: '{',
    blockEnd: '}',
  },
  csharp: {
    functionPattern:
      /^[\s]*(public|private|protected|internal)?\s*(static|async|virtual|override)?\s*\w+\s+\w+\s*\(/,
    classPattern:
      /^[\s]*(public|private|protected|internal)?\s*(abstract|sealed|partial)?\s*class\s+\w+/,
    importPattern: /^[\s]*using\s+/,
    singleLineComment: '//',
    multiLineCommentStart: '/*',
    multiLineCommentEnd: '*/',
    blockStart: '{',
    blockEnd: '}',
  },
  cpp: {
    functionPattern: /^[\s]*(\w+\s+)+\w+\s*\([^)]*\)\s*(const)?\s*\{?/,
    classPattern: /^[\s]*(class|struct)\s+\w+/,
    importPattern: /^[\s]*#include\s+/,
    singleLineComment: '//',
    multiLineCommentStart: '/*',
    multiLineCommentEnd: '*/',
    blockStart: '{',
    blockEnd: '}',
  },
  go: {
    functionPattern: /^[\s]*func\s+(\(\w+\s+\*?\w+\)\s+)?\w+\s*\(/,
    classPattern: /^[\s]*type\s+\w+\s+(struct|interface)/,
    importPattern: /^[\s]*(import|package)\s+/,
    singleLineComment: '//',
    multiLineCommentStart: '/*',
    multiLineCommentEnd: '*/',
    blockStart: '{',
    blockEnd: '}',
  },
  rust: {
    functionPattern: /^[\s]*(pub\s+)?(async\s+)?fn\s+\w+/,
    classPattern: /^[\s]*(pub\s+)?(struct|enum|trait|impl)\s+\w+/,
    importPattern: /^[\s]*(use|mod)\s+/,
    singleLineComment: '//',
    multiLineCommentStart: '/*',
    multiLineCommentEnd: '*/',
    blockStart: '{',
    blockEnd: '}',
  },
  ruby: {
    functionPattern: /^[\s]*def\s+\w+/,
    classPattern: /^[\s]*(class|module)\s+\w+/,
    importPattern: /^[\s]*require\s+/,
    singleLineComment: '#',
    multiLineCommentStart: '=begin',
    multiLineCommentEnd: '=end',
    blockStart: '',
    blockEnd: 'end',
  },
  php: {
    functionPattern: /^[\s]*(public|private|protected)?\s*(static)?\s*function\s+\w+/,
    classPattern: /^[\s]*(abstract|final)?\s*class\s+\w+/,
    importPattern: /^[\s]*(use|require|include|require_once|include_once)\s+/,
    singleLineComment: '//',
    multiLineCommentStart: '/*',
    multiLineCommentEnd: '*/',
    blockStart: '{',
    blockEnd: '}',
  },
  swift: {
    functionPattern:
      /^[\s]*(public|private|internal|fileprivate|open)?\s*(static|class)?\s*func\s+\w+/,
    classPattern:
      /^[\s]*(public|private|internal|fileprivate|open)?\s*(final)?\s*(class|struct|enum|protocol)\s+\w+/,
    importPattern: /^[\s]*import\s+/,
    singleLineComment: '//',
    multiLineCommentStart: '/*',
    multiLineCommentEnd: '*/',
    blockStart: '{',
    blockEnd: '}',
  },
  kotlin: {
    functionPattern: /^[\s]*(public|private|protected|internal)?\s*(suspend)?\s*fun\s+\w+/,
    classPattern:
      /^[\s]*(public|private|protected|internal)?\s*(abstract|open|data|sealed)?\s*(class|interface|object)\s+\w+/,
    importPattern: /^[\s]*(import|package)\s+/,
    singleLineComment: '//',
    multiLineCommentStart: '/*',
    multiLineCommentEnd: '*/',
    blockStart: '{',
    blockEnd: '}',
  },
  generic: {
    functionPattern: /^[\s]*(function|func|def|fn)\s+\w+/,
    classPattern: /^[\s]*(class|struct|type|interface)\s+\w+/,
    importPattern: /^[\s]*(import|include|require|use)\s+/,
    singleLineComment: '//',
    multiLineCommentStart: '/*',
    multiLineCommentEnd: '*/',
    blockStart: '{',
    blockEnd: '}',
  },
};

/**
 * Code element types.
 */
type CodeElementType = 'import' | 'class' | 'function' | 'comment' | 'code';

/**
 * Parsed code element.
 */
interface CodeElement {
  type: CodeElementType;
  content: string;
  start: number;
  end: number;
  name?: string;
  scopeType?: string;
}

/**
 * Split source code into chunks while preserving structure.
 *
 * @param text - Source code to split
 * @param options - Chunking configuration
 * @returns Array of chunks with code metadata
 *
 * @example
 * ```typescript
 * const chunks = codeChunk(sourceCode, {
 *   size: 1000,
 *   language: 'typescript',
 *   preserveBlocks: true,
 * });
 *
 * // Chunks include scope information:
 * // chunk.metadata.scopeName = "MyClass"
 * // chunk.metadata.scopeType = "class"
 * ```
 */
export function codeChunk(text: string, options: CodeChunkOptions = {}): Chunk[] {
  const {
    size = DEFAULT_CHUNK_OPTIONS.size,
    overlap = DEFAULT_CHUNK_OPTIONS.overlap,
    minSize = DEFAULT_CHUNK_OPTIONS.minSize,
    trim = DEFAULT_CHUNK_OPTIONS.trim,
    language = detectLanguage(text),
    preserveBlocks = true,
    includeImports = true,
    maxLines,
  } = options;

  if (!text || text.length === 0) {
    return [];
  }

  const patterns = LANGUAGE_PATTERNS[language];
  const elements = parseCode(text, patterns);

  // Extract imports for context
  const imports = includeImports
    ? elements.filter((e) => e.type === 'import').map((e) => e.content)
    : [];
  const importBlock = imports.join('\n');

  // Build chunks
  const chunks = buildCodeChunks(elements, {
    size,
    overlap,
    minSize,
    trim,
    preserveBlocks,
    importBlock: includeImports ? importBlock : '',
    maxLines,
    language,
  });

  return chunks;
}

/**
 * Detect programming language from code content.
 */
function detectLanguage(text: string): CodeLanguage {
  const lines = text.split('\n').slice(0, 50); // Check first 50 lines
  const content = lines.join('\n').toLowerCase();

  // Check for language-specific patterns
  if (content.includes('import react') || content.includes('from "react"')) {
    return text.includes(': ') && (text.includes('interface ') || text.includes(': React.'))
      ? 'typescript'
      : 'javascript';
  }
  if (content.includes('package main') || content.includes('func main()')) return 'go';
  if (content.includes('fn main()') || content.includes('impl ')) return 'rust';
  if (content.includes('def __init__') || content.includes('import numpy')) return 'python';
  if (content.includes('public static void main') || content.includes('package ')) {
    if (content.includes('fun ') || content.includes('val ')) return 'kotlin';
    return 'java';
  }
  if (content.includes('namespace ') || content.includes('using System')) return 'csharp';
  if (content.includes('#include <')) return 'cpp';
  if (content.includes('<?php')) return 'php';
  if (content.includes('import Foundation') || content.includes('import UIKit')) return 'swift';
  if (content.includes('require ') && content.includes('end')) return 'ruby';

  // Check file patterns
  if (text.includes('interface ') || text.includes(': ')) return 'typescript';
  if (text.includes('function ') || text.includes('=>')) return 'javascript';
  if (text.includes('def ') || text.includes('class ')) return 'python';

  return 'generic';
}

/**
 * Parse code into structural elements.
 */
function parseCode(text: string, patterns: LanguagePatterns): CodeElement[] {
  const elements: CodeElement[] = [];
  const lines = text.split('\n');
  let position = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const lineStart = position;

    // Check for imports
    if (patterns.importPattern.test(line)) {
      let importContent = line;
      let importEnd = position + line.length;

      // Handle multi-line imports
      if (line.includes('{') && !line.includes('}')) {
        position += line.length + 1;
        i++;
        while (i < lines.length && !lines[i].includes('}')) {
          importContent += '\n' + lines[i];
          importEnd = position + lines[i].length;
          position += lines[i].length + 1;
          i++;
        }
        if (i < lines.length) {
          importContent += '\n' + lines[i];
          importEnd = position + lines[i].length;
        }
      }

      elements.push({
        type: 'import',
        content: importContent,
        start: lineStart,
        end: importEnd,
      });
      position += line.length + 1;
      i++;
      continue;
    }

    // Check for class definitions
    if (patterns.classPattern.test(line)) {
      const className =
        extractName(line, 'class') ||
        extractName(line, 'struct') ||
        extractName(line, 'interface') ||
        extractName(line, 'type') ||
        extractName(line, 'trait') ||
        extractName(line, 'impl');
      const blockStart = lineStart;
      let blockContent = line + '\n';
      position += line.length + 1;
      i++;

      // Find the end of the class block
      let braceCount = countChar(line, '{') - countChar(line, '}');
      const indentLevel = getIndent(line);

      while (i < lines.length) {
        const nextLine = lines[i];
        blockContent += nextLine + '\n';
        braceCount += countChar(nextLine, '{') - countChar(nextLine, '}');

        position += nextLine.length + 1;
        i++;

        // Check for block end
        if (patterns.blockEnd === '}' && braceCount <= 0 && nextLine.includes('}')) {
          break;
        }
        if (patterns.blockEnd === 'end' && nextLine.trim() === 'end') {
          break;
        }
        // Python: check indentation
        if (
          patterns.blockStart === ':' &&
          getIndent(nextLine) <= indentLevel &&
          nextLine.trim() !== ''
        ) {
          // Went back, include previous line only
          position -= nextLine.length + 1;
          blockContent = blockContent.slice(0, blockContent.length - nextLine.length - 1);
          i--;
          break;
        }
      }

      elements.push({
        type: 'class',
        content: blockContent.trimEnd(),
        start: blockStart,
        end: position,
        name: className,
        scopeType: 'class',
      });
      continue;
    }

    // Check for function definitions
    if (patterns.functionPattern.test(line)) {
      const funcName = extractFunctionName(line);
      const blockStart = lineStart;
      let blockContent = line + '\n';
      position += line.length + 1;
      i++;

      // Find the end of the function block
      let braceCount = countChar(line, '{') - countChar(line, '}');
      const indentLevel = getIndent(line);

      while (i < lines.length) {
        const nextLine = lines[i];
        blockContent += nextLine + '\n';
        braceCount += countChar(nextLine, '{') - countChar(nextLine, '}');

        position += nextLine.length + 1;
        i++;

        // Check for block end
        if (patterns.blockEnd === '}' && braceCount <= 0 && blockContent.includes('{')) {
          break;
        }
        if (patterns.blockEnd === 'end' && nextLine.trim() === 'end') {
          break;
        }
        // Python: check indentation
        if (
          patterns.blockStart === ':' &&
          getIndent(nextLine) <= indentLevel &&
          nextLine.trim() !== ''
        ) {
          position -= nextLine.length + 1;
          blockContent = blockContent.slice(0, blockContent.length - nextLine.length - 1);
          i--;
          break;
        }
      }

      elements.push({
        type: 'function',
        content: blockContent.trimEnd(),
        start: blockStart,
        end: position,
        name: funcName,
        scopeType: 'function',
      });
      continue;
    }

    // Check for multi-line comments
    if (
      line.includes(patterns.multiLineCommentStart) &&
      !line.includes(patterns.multiLineCommentEnd)
    ) {
      const commentStart = lineStart;
      let commentContent = line + '\n';
      position += line.length + 1;
      i++;

      while (i < lines.length && !lines[i].includes(patterns.multiLineCommentEnd)) {
        commentContent += lines[i] + '\n';
        position += lines[i].length + 1;
        i++;
      }

      if (i < lines.length) {
        commentContent += lines[i];
        position += lines[i].length + 1;
        i++;
      }

      elements.push({
        type: 'comment',
        content: commentContent.trimEnd(),
        start: commentStart,
        end: position,
      });
      continue;
    }

    // Regular code line
    elements.push({
      type: 'code',
      content: line,
      start: lineStart,
      end: position + line.length,
    });
    position += line.length + 1;
    i++;
  }

  return elements;
}

/**
 * Extract a name after a keyword.
 */
function extractName(line: string, keyword: string): string | undefined {
  const regex = new RegExp(`${keyword}\\s+(\\w+)`);
  const match = line.match(regex);
  return match?.[1];
}

/**
 * Extract function name from a line.
 */
function extractFunctionName(line: string): string | undefined {
  // Try various patterns
  let match = line.match(/function\s+(\w+)/);
  if (match) return match[1];

  match = line.match(/def\s+(\w+)/);
  if (match) return match[1];

  match = line.match(/fn\s+(\w+)/);
  if (match) return match[1];

  match = line.match(/func\s+(?:\([^)]+\)\s+)?(\w+)/);
  if (match) return match[1];

  match = line.match(/(?:const|let|var)\s+(\w+)\s*=/);
  if (match) return match[1];

  return undefined;
}

/**
 * Count occurrences of a character.
 */
function countChar(str: string, char: string): number {
  let count = 0;
  for (const c of str) {
    if (c === char) count++;
  }
  return count;
}

/**
 * Get indentation level of a line.
 */
function getIndent(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

/**
 * Build chunks from code elements.
 */
function buildCodeChunks(
  elements: CodeElement[],
  options: {
    size: number;
    overlap: number;
    minSize: number;
    trim: boolean;
    preserveBlocks: boolean;
    importBlock: string;
    maxLines?: number;
    language: CodeLanguage;
  }
): Chunk[] {
  const chunks: Chunk[] = [];
  let currentChunk = '';
  let currentStart = -1;
  let currentScope: { name?: string; type?: string } = {};
  let chunkIndex = 0;

  const finalizeChunk = (forceMetadata?: ChunkMetadata) => {
    if (currentChunk.length >= options.minSize) {
      const text = options.trim ? currentChunk.trim() : currentChunk;
      if (text.length >= options.minSize) {
        const metadata: ChunkMetadata = forceMetadata || {
          language: options.language,
        };
        if (currentScope.name) metadata.scopeName = currentScope.name;
        if (currentScope.type) metadata.scopeType = currentScope.type;

        chunks.push({
          text,
          start: currentStart,
          end: currentStart + currentChunk.length,
          index: chunkIndex++,
          metadata,
        });
      }
    }
    currentChunk = '';
    currentStart = -1;
    currentScope = {};
  };

  // Skip imports (they'll be added as context)
  const codeElements = elements.filter((e) => e.type !== 'import');

  for (const element of codeElements) {
    // Handle classes and functions that should be preserved
    if (options.preserveBlocks && (element.type === 'class' || element.type === 'function')) {
      // Finalize current chunk
      if (currentChunk) {
        finalizeChunk();
      }

      // If the block fits in size limit, add as single chunk
      let content = element.content;
      if (options.importBlock && element.type === 'function') {
        // Add imports for context to standalone functions
        content = options.importBlock + '\n\n' + content;
      }

      if (content.length <= options.size || !options.maxLines) {
        chunks.push({
          text: options.trim ? content.trim() : content,
          start: element.start,
          end: element.end,
          index: chunkIndex++,
          metadata: {
            language: options.language,
            scopeName: element.name,
            scopeType: element.scopeType,
          },
        });
      } else {
        // Split large blocks by lines
        const lines = content.split('\n');
        let lineChunk = '';
        let lineStart = element.start;
        let lineCount = 0;

        for (const line of lines) {
          if (
            (options.maxLines && lineCount >= options.maxLines) ||
            lineChunk.length + line.length > options.size
          ) {
            if (lineChunk.length >= options.minSize) {
              chunks.push({
                text: options.trim ? lineChunk.trim() : lineChunk,
                start: lineStart,
                end: lineStart + lineChunk.length,
                index: chunkIndex++,
                metadata: {
                  language: options.language,
                  scopeName: element.name,
                  scopeType: element.scopeType,
                },
              });
            }
            lineChunk = line + '\n';
            lineStart = element.start + content.indexOf(line);
            lineCount = 1;
          } else {
            lineChunk += line + '\n';
            lineCount++;
          }
        }

        // Final line chunk
        if (lineChunk.length >= options.minSize) {
          chunks.push({
            text: options.trim ? lineChunk.trim() : lineChunk,
            start: lineStart,
            end: element.end,
            index: chunkIndex++,
            metadata: {
              language: options.language,
              scopeName: element.name,
              scopeType: element.scopeType,
            },
          });
        }
      }
      continue;
    }

    // Regular code - accumulate
    const newLength = currentChunk.length + element.content.length + 1;
    if (newLength > options.size && currentChunk.length > 0) {
      finalizeChunk();
      currentChunk = element.content;
      currentStart = element.start;
    } else {
      if (currentChunk) {
        currentChunk += '\n' + element.content;
      } else {
        currentChunk = element.content;
        currentStart = element.start;
      }
    }
  }

  // Finalize last chunk
  if (currentChunk) {
    finalizeChunk();
  }

  return chunks;
}

/**
 * Create a code chunker with preset options.
 */
export function createCodeChunker(
  defaultOptions: CodeChunkOptions = {}
): (text: string, options?: CodeChunkOptions) => Chunk[] {
  return (text: string, options: CodeChunkOptions = {}) =>
    codeChunk(text, { ...defaultOptions, ...options });
}

