'use client';

import { AlertTriangle, FileUp, Check } from 'lucide-react';

import { cn } from '@/registry/localmode/lib/utils';

/** External vector format. */
export type ExternalFormat = 'pinecone' | 'chroma' | 'csv' | 'jsonl';

/**
 * Minimal inline format badge. Mirrors the cross-family
 * `@localmode/ui/data-documents/format-detection-badge` so this flow builds
 * independently; swap to that component when it is installed.
 */
function FormatBadge({ format }: { format: ExternalFormat }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {format}
    </span>
  );
}

/** Parse preview (mirrors core `ParseResult`). */
export interface ImportPreview {
  format: ExternalFormat;
  totalRecords: number;
  recordsWithVectors: number;
  recordsWithTextOnly: number;
  dimensions: number | null;
}

/** Import progress (mirrors core `ImportProgress`). */
export interface ImportProgressLike {
  phase: 'parsing' | 'validating' | 'embedding' | 'importing';
  overallCompleted: number;
  overallTotal: number;
}

/** Import result stats (mirrors core `ImportStats`). */
export interface ImportStatsLike {
  imported: number;
  skipped: number;
  reEmbedded: number;
  totalParsed: number;
  format: ExternalFormat;
  durationMs: number;
}

/** A row shown in the preview table. */
export interface PreviewRecord {
  id: string;
  text?: string;
  hasVector?: boolean;
}

/** Props for {@link VectorImportFlow}. */
export interface VectorImportFlowProps {
  /** Parse preview shown before a destructive import. */
  preview?: ImportPreview | null;
  /** Target VectorDB dimensions (for the mismatch warning). */
  targetDimensions?: number;
  /** Sample records for the preview table. */
  records?: PreviewRecord[];
  /** Live import progress. */
  progress?: ImportProgressLike | null;
  /** Final import stats (shown when the import completes). */
  stats?: ImportStatsLike | null;
  /** Whether an import is running. */
  isImporting?: boolean;
  /** Fired to confirm the import. */
  onConfirm?: () => void;
  /** Fired to cancel/dismiss the preview. */
  onCancel?: () => void;
  /** Additional class names merged onto the root element. */
  className?: string;
}

const PHASES: ImportProgressLike['phase'][] = [
  'parsing',
  'validating',
  'embedding',
  'importing',
];

/**
 * A guarded vector-import flow for `useImportExport`: a preview panel
 * (detected-format badge, total / with-vectors / text-only counts, detected
 * dimensions, dimension-mismatch warning, Cancel/Confirm), a phased progress
 * bar (parsing → validating → embedding → importing), a result stats banner
 * (imported / skipped / re-embedded, format, duration), and a record-preview
 * table for row-level sanity checks before a destructive ingest.
 *
 * @example
 * ```tsx
 * <VectorImportFlow preview={parseResult} onConfirm={runImport} />
 * ```
 */
export function VectorImportFlow({
  preview,
  targetDimensions,
  records,
  progress,
  stats,
  isImporting = false,
  onConfirm,
  onCancel,
  className,
}: VectorImportFlowProps) {
  const mismatch =
    preview?.dimensions != null &&
    targetDimensions != null &&
    preview.dimensions !== targetDimensions;

  return (
    <div
      className={cn(
        '@container flex w-full max-w-lg flex-col gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm',
        className,
      )}
    >
      {/* Result banner */}
      {stats && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
          <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden="true" />
          <div className="text-xs">
            <p className="font-medium text-emerald-700 dark:text-emerald-300">
              Imported {stats.imported.toLocaleString()} records
            </p>
            <p className="text-muted-foreground">
              {stats.skipped} skipped · {stats.reEmbedded} re-embedded ·{' '}
              <FormatBadge format={stats.format} /> ·{' '}
              {(stats.durationMs / 1000).toFixed(1)}s
            </p>
          </div>
        </div>
      )}

      {/* Preview panel */}
      {preview && !stats && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <FileUp className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-semibold">Import preview</span>
            <FormatBadge format={preview.format} />
          </div>

          <dl className="grid grid-cols-2 gap-2 text-xs @md:grid-cols-4">
            <Stat label="Total" value={preview.totalRecords.toLocaleString()} />
            <Stat label="With vectors" value={preview.recordsWithVectors.toLocaleString()} />
            <Stat label="Text-only" value={preview.recordsWithTextOnly.toLocaleString()} />
            <Stat
              label="Dimensions"
              value={preview.dimensions != null ? String(preview.dimensions) : '-'}
            />
          </dl>

          {mismatch && (
            <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              Dimension mismatch: source {preview.dimensions} vs target{' '}
              {targetDimensions}. Text-only records will be re-embedded.
            </p>
          )}
        </div>
      )}

      {/* Phased progress */}
      {isImporting && progress && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1">
            {PHASES.map((p) => {
              const idx = PHASES.indexOf(progress.phase);
              const pIdx = PHASES.indexOf(p);
              const state = pIdx < idx ? 'done' : pIdx === idx ? 'active' : 'pending';
              return (
                <div key={p} className="flex flex-1 flex-col gap-1">
                  <div
                    className={cn(
                      'h-1.5 rounded-full',
                      state === 'done' && 'bg-primary',
                      state === 'active' && 'bg-primary/60 animate-pulse',
                      state === 'pending' && 'bg-muted',
                    )}
                  />
                  <span
                    className={cn(
                      'text-center text-[10px] capitalize',
                      state === 'active' ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {p}
                  </span>
                </div>
              );
            })}
          </div>
          <span className="text-center text-xs tabular-nums text-muted-foreground">
            {progress.overallCompleted}/{progress.overallTotal}
          </span>
        </div>
      )}

      {/* Record preview table */}
      {records && records.length > 0 && !stats && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full table-fixed text-left text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 font-medium">ID</th>
                <th className="px-2 py-1.5 font-medium">Text</th>
                <th className="px-2 py-1.5 font-medium">Vector</th>
              </tr>
            </thead>
            <tbody>
              {records.slice(0, 5).map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="max-w-0 truncate px-2 py-1.5 font-mono">{r.id}</td>
                  <td className="max-w-0 truncate px-2 py-1.5">{r.text ?? '-'}</td>
                  <td className="px-2 py-1.5">{r.hasVector ? '✓' : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Actions */}
      {preview && !stats && !isImporting && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Confirm import
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border bg-background px-2 py-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
