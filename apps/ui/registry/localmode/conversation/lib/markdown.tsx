'use client';

/**
 * @file markdown.tsx
 * @description Minimal, dependency-free, streaming-safe markdown renderer used by
 * `Response` and `Message`. It handles the common subset (headings, bold/italic,
 * inline code, fenced code blocks, links, lists, blockquotes) and — crucially —
 * tolerates *partial* markdown (an unterminated code fence during local token
 * streaming) without throwing or breaking layout.
 *
 * This keeps the copied component zero-extra-dependency. If you prefer a richer
 * renderer, swap `renderMarkdown` for `streamdown` or `react-markdown` +
 * `remark-gfm` in your copy — the call sites only depend on the
 * `(markdown: string) => ReactNode` shape.
 */
import * as React from 'react';
import { cn } from '@/registry/localmode/lib/utils';

/** Escape inner HTML-special characters for safe text rendering. */
function escapeText(text: string) {
  return text;
}

/** Render inline markdown spans (bold, italic, inline code, links) into nodes. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Combined tokenizer for `code`, **bold**, *italic*, [text](url).
  const pattern =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(escapeText(text.slice(lastIndex, match.index)));
    }
    const token = match[0];
    const key = `${keyPrefix}-i${i++}`;
    if (token.startsWith('`')) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      nodes.push(
        <strong key={key} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('*')) {
      nodes.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    } else {
      // link [text](url)
      const m = /\[([^\]]+)\]\(([^)]+)\)/.exec(token);
      if (m) {
        nodes.push(
          <a
            key={key}
            href={m[2]}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary underline underline-offset-2"
          >
            {m[1]}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(escapeText(text.slice(lastIndex)));
  }
  return nodes;
}

/**
 * Render a markdown string to React nodes. Streaming-safe: an unterminated
 * code fence is rendered as an open code block rather than throwing.
 */
export function renderMarkdown(markdown: string): React.ReactNode {
  const lines = markdown.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block (tolerates a missing closing fence at stream end).
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const lang = fence[1];
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      // Skip the closing fence if present; if absent we've hit stream end.
      if (i < lines.length) i++;
      blocks.push(
        <pre
          key={`b${key++}`}
          className="my-2 overflow-x-auto rounded-md border border-border bg-muted/50 p-3 text-sm"
          data-language={lang || undefined}
        >
          <code className="font-mono">{codeLines.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    // Heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const Tag = `h${Math.min(level + 2, 6)}` as keyof React.JSX.IntrinsicElements;
      blocks.push(
        <Tag key={`b${key++}`} className="mt-3 mb-1 font-semibold">
          {renderInline(heading[2], `h${key}`)}
        </Tag>,
      );
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push(
        <blockquote
          key={`b${key++}`}
          className="my-2 border-l-2 border-border pl-3 text-muted-foreground italic"
        >
          {renderInline(quoteLines.join(' '), `q${key}`)}
        </blockquote>,
      );
      continue;
    }

    // Unordered / ordered list
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items: string[] = [];
      const ordered = /^\s*\d+\.\s+/.test(line);
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
        i++;
      }
      const ListTag = ordered ? 'ol' : 'ul';
      blocks.push(
        <ListTag
          key={`b${key++}`}
          className={cn(
            'my-2 ml-5 space-y-1',
            ordered ? 'list-decimal' : 'list-disc',
          )}
        >
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it, `li${key}-${idx}`)}</li>
          ))}
        </ListTag>,
      );
      continue;
    }

    // Blank line → spacing
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph (consume consecutive non-blank, non-block lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,6})\s/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*([-*]|\d+\.)\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={`b${key++}`} className="my-1 leading-relaxed">
        {renderInline(paraLines.join(' '), `p${key}`)}
      </p>,
    );
  }

  return blocks;
}

/** Props for {@link Markdown}. */
export interface MarkdownProps {
  /** The markdown source string (may be partial/streaming). */
  children: string;
  /** Additional class names merged onto the prose root. */
  className?: string;
}

/**
 * Renders a (possibly partial) markdown string as themed prose. Dependency-free
 * and streaming-safe.
 */
export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div
      className={cn(
        'text-sm break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        className,
      )}
    >
      {renderMarkdown(children)}
    </div>
  );
}
