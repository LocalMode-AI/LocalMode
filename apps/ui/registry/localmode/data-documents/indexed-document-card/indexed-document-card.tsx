'use client';

import * as React from 'react';
import { FileText, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Props for {@link IndexedDocumentCard}. */
export interface IndexedDocumentCardProps {
  /** Display name of the indexed document (e.g. `"report.pdf"`). */
  filename: string;
  /**
   * Number of chunks the document was split into and stored in the VectorDB.
   * Comes from your ingest state / `useSemanticChunk` output length.
   */
  chunkCount: number;
  /** Number of pages, if known (e.g. from PDF extraction). Omit to hide. */
  pageCount?: number;
  /** Original file size in bytes. Omit to hide. */
  sizeBytes?: number;
  /**
   * Called when the user activates the delete control. Wire it to your
   * VectorDB delete; while it runs, pass `deleting` to show the loading state.
   */
  onDelete?: () => void;
  /**
   * Show the delete control in a loading state and disable it (the removal is
   * in flight).
   * @default false
   */
  deleting?: boolean;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/** Format a byte count as a short human-readable string. */
function formatBytes(bytes: number) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}

/**
 * A card representing a single locally-indexed document in a VectorDB. Shows a
 * truncated filename (full name in a native tooltip), chunk count, optional page
 * count and file size, and a delete control that reveals on hover/focus and
 * shows a spinner while removing.
 *
 * Presentational: the page/chunk counts come from your app's ingest state (e.g.
 * `useSemanticChunk` output length + PDF page count), not a single hook, so the
 * prop contract is explicit. Styled with shadcn/ui CSS variables.
 *
 * @example
 * ```tsx
 * <IndexedDocumentCard
 *   filename="annual-report-2024.pdf"
 *   pageCount={42}
 *   chunkCount={128}
 *   sizeBytes={2_400_000}
 *   deleting={removingId === doc.id}
 *   onDelete={() => remove(doc.id)}
 * />
 * ```
 */
export function IndexedDocumentCard({
  filename,
  chunkCount,
  pageCount,
  sizeBytes,
  onDelete,
  deleting = false,
  className,
}: IndexedDocumentCardProps) {
  const stats: string[] = [];
  if (pageCount !== undefined) {
    stats.push(`${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`);
  }
  stats.push(`${chunkCount} ${chunkCount === 1 ? 'chunk' : 'chunks'}`);
  if (sizeBytes !== undefined) stats.push(formatBytes(sizeBytes));

  return (
    <div
      className={cn(
        'group/doc relative flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-card-foreground shadow-sm',
        className,
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <FileText className="size-4" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm font-medium"
          title={filename}
        >
          {filename}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {stats.join(' · ')}
        </p>
      </div>

      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          aria-label={`Delete ${filename}`}
          aria-busy={deleting}
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none',
            // Faint resting state on touch/small screens (discoverable without
            // hover); hidden until hover/focus on desktop; always visible while
            // deleting.
            deleting
              ? 'opacity-100'
              : 'opacity-60 sm:opacity-0 sm:group-hover/doc:opacity-100 focus-visible:opacity-100',
          )}
        >
          {deleting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="size-4" aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
}
