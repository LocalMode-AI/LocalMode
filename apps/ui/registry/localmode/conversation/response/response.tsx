'use client';

/**
 * @file response.tsx
 * @description Streaming markdown renderer for assistant output. `Response`
 * renders streamed text as markdown, shows a blinking cursor while `streaming`
 * is true, and tolerates partial/incomplete markdown (an unterminated code
 * fence mid-stream) without breaking layout. It supports an optional client-side
 * typewriter reveal and swappable KaTeX/Mermaid renderers gated behind props.
 *
 * Driven by `@localmode/react`'s `useChat`/`useGenerateText` token streams.
 */
import * as React from 'react';
import { cn } from '@/registry/localmode/lib/utils';
import { Markdown } from '../lib/markdown';

/** A swappable block renderer for math/diagrams. */
export type BlockRenderer = (source: string) => React.ReactNode;

/** Props for {@link Response}. */
export interface ResponseProps extends React.ComponentProps<'div'> {
  /** The (possibly partial) markdown content to render. */
  children: string;
  /**
   * Whether content is still arriving. When true a blinking cursor is shown
   * after the text and removed on completion.
   * @default false
   */
  streaming?: boolean;
  /**
   * Reveal already-resolved text one character at a time. Ignored while
   * `streaming` (live token streams reveal naturally).
   * @default false
   */
  typewriter?: boolean;
  /** Characters revealed per tick when `typewriter` is enabled. @default 2 */
  typewriterSpeed?: number;
  /**
   * Optional LaTeX/math block renderer (e.g. a KaTeX-backed function). When
   * provided, `$$…$$` blocks are routed to it. Declare `katex` in your project
   * if you supply one.
   */
  renderMath?: BlockRenderer;
  /**
   * Optional Mermaid diagram renderer. When provided, ```mermaid fences are
   * routed to it. Declare `mermaid` in your project if you supply one.
   */
  renderMermaid?: BlockRenderer;
}

/** Split content into (markdown | math | mermaid) segments for routing. */
interface Segment {
  kind: 'markdown' | 'math' | 'mermaid';
  source: string;
}

function segment(content: string, hasMath: boolean, hasMermaid: boolean): Segment[] {
  if (!hasMath && !hasMermaid) return [{ kind: 'markdown', source: content }];
  const segments: Segment[] = [];
  // Tokenize on ```mermaid fences and $$ math blocks.
  const re = /```mermaid\n([\s\S]*?)```|\$\$([\s\S]*?)\$\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) {
      segments.push({ kind: 'markdown', source: content.slice(last, m.index) });
    }
    if (m[1] != null && hasMermaid) {
      segments.push({ kind: 'mermaid', source: m[1] });
    } else if (m[2] != null && hasMath) {
      segments.push({ kind: 'math', source: m[2] });
    } else {
      segments.push({ kind: 'markdown', source: m[0] });
    }
    last = re.lastIndex;
  }
  if (last < content.length) {
    segments.push({ kind: 'markdown', source: content.slice(last) });
  }
  return segments;
}

/**
 * Streamed markdown response with a streaming cursor.
 *
 * @example
 * ```tsx
 * <Response streaming={isStreaming}>{assistantText}</Response>
 * ```
 */
export function Response({
  children,
  streaming = false,
  typewriter = false,
  typewriterSpeed = 2,
  renderMath,
  renderMermaid,
  className,
  ...props
}: ResponseProps) {
  const [revealed, setRevealed] = React.useState(
    typewriter && !streaming ? '' : children,
  );

  React.useEffect(() => {
    if (streaming || !typewriter) {
      setRevealed(children);
      return;
    }
    let i = 0;
    setRevealed('');
    const id = window.setInterval(() => {
      i += Math.max(1, typewriterSpeed);
      setRevealed(children.slice(0, i));
      if (i >= children.length) window.clearInterval(id);
    }, 16);
    return () => window.clearInterval(id);
  }, [children, streaming, typewriter, typewriterSpeed]);

  const content = streaming ? children : revealed;
  const segments = segment(content, Boolean(renderMath), Boolean(renderMermaid));

  return (
    <div
      data-slot="response"
      data-streaming={streaming || undefined}
      className={cn('text-sm', className)}
      {...props}
    >
      {segments.map((seg, i) => {
        if (seg.kind === 'math' && renderMath) {
          return (
            <div key={i} className="my-2 overflow-x-auto">
              {renderMath(seg.source)}
            </div>
          );
        }
        if (seg.kind === 'mermaid' && renderMermaid) {
          return (
            <div key={i} className="my-2 overflow-x-auto">
              {renderMermaid(seg.source)}
            </div>
          );
        }
        return <Markdown key={i}>{seg.source}</Markdown>;
      })}
      {streaming && (
        <span
          aria-hidden="true"
          data-slot="response-cursor"
          className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-foreground align-middle"
        />
      )}
    </div>
  );
}
