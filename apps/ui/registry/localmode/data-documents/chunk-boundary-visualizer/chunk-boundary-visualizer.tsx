'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The minimal per-chunk shape this visualizer needs. Map your
 * `useSemanticChunk` output (`Chunk[]`) into these: `text` is the chunk body,
 * `chunkIndex` is the 0-based position, and `rightSimilarity` is the cosine
 * similarity with the next chunk (from
 * `chunk.metadata.semanticBoundaries.rightSimilarity`) — `null` for the last
 * chunk or when not in semantic mode.
 */
export interface ChunkInfo {
  /** The chunk's text content. */
  text: string;
  /** 0-based chunk index (used for the `C#` badge). */
  chunkIndex: number;
  /**
   * Cosine similarity with the next chunk (0–1), or `null` for the last chunk /
   * non-semantic modes. Surfaced as a faint `sim: 0.NN` boundary label.
   */
  rightSimilarity?: number | null;
}

/** The active chunking mode. Boundary similarities only show in `"semantic"`. */
export type ChunkMode = 'semantic' | 'fixed' | 'recursive' | (string & {});

/** Props for {@link ChunkBoundaryVisualizer}. */
export interface ChunkBoundaryVisualizerProps {
  /**
   * The chunks to visualize, in order. Map `useSemanticChunk`'s `Chunk[]` into
   * `ChunkInfo[]` (pulling `rightSimilarity` from
   * `metadata.semanticBoundaries`).
   */
  chunks: ChunkInfo[];
  /**
   * The active chunking mode. In `"semantic"`, inter-chunk similarity labels
   * render between segments; other modes hide them.
   * @default "semantic"
   */
  mode?: ChunkMode;
  /**
   * Truncate each chunk's preview to this many characters (`0`/undefined shows
   * the full text).
   */
  maxCharsPerChunk?: number;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/** Alternating soft accent backgrounds so adjacent chunks read as distinct. */
const SEGMENT_TINTS = [
  'bg-sky-500/10 border-sky-500/20',
  'bg-violet-500/10 border-violet-500/20',
  'bg-emerald-500/10 border-emerald-500/20',
  'bg-amber-500/10 border-amber-500/20',
];

/** Truncate to `max` chars with an ellipsis when `max` is positive. */
function truncate(text: string, max?: number) {
  if (!max || max <= 0 || text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

/**
 * Visualizes how a document was split into chunks. Each chunk renders as a
 * distinct alternating-accent segment with a monospace `C1`/`C2` badge; in
 * semantic mode, the inter-chunk boundary similarity (e.g. `sim: 0.74`) appears
 * as a faint label between segments — lower values mark stronger topic breaks.
 *
 * Takes a decoupled `ChunkInfo[]` plus the active mode, so it pairs directly
 * with `useSemanticChunk` (map `Chunk[]` → `ChunkInfo[]`). Display-only; it owns
 * no chunking logic. Styled with shadcn/ui CSS variables.
 *
 * @example
 * ```tsx
 * const { data: chunks } = useSemanticChunk({ model });
 * <ChunkBoundaryVisualizer
 *   mode="semantic"
 *   chunks={(chunks ?? []).map((c) => ({
 *     text: c.text,
 *     chunkIndex: c.index,
 *     rightSimilarity: c.metadata?.semanticBoundaries?.rightSimilarity ?? null,
 *   }))}
 * />
 * ```
 */
export function ChunkBoundaryVisualizer({
  chunks,
  mode = 'semantic',
  maxCharsPerChunk,
  className,
}: ChunkBoundaryVisualizerProps) {
  const isSemantic = mode === 'semantic';

  if (chunks.length === 0) {
    return (
      <div
        className={cn(
          'rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground',
          className,
        )}
      >
        No chunks to display.
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {chunks.map((chunk, i) => {
        const tint = SEGMENT_TINTS[i % SEGMENT_TINTS.length];
        const sim = chunk.rightSimilarity;
        const showBoundary =
          isSemantic &&
          i < chunks.length - 1 &&
          typeof sim === 'number' &&
          Number.isFinite(sim);

        return (
          <React.Fragment key={chunk.chunkIndex}>
            <div
              className={cn(
                'flex gap-3 rounded-lg border p-3 text-sm',
                tint,
              )}
            >
              <span className="shrink-0 self-start select-none rounded bg-background/60 px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground">
                C{chunk.chunkIndex + 1}
              </span>
              <p className="min-w-0 whitespace-pre-wrap break-words text-foreground/90">
                {truncate(chunk.text, maxCharsPerChunk)}
              </p>
            </div>

            {showBoundary && (
              <div
                className="flex items-center gap-2 px-2 text-[0.7rem] text-muted-foreground"
                aria-label={`Boundary similarity between chunk ${chunk.chunkIndex + 1} and ${chunk.chunkIndex + 2}`}
              >
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
                <span className="font-mono tabular-nums">
                  sim: {sim!.toFixed(2)}
                </span>
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
