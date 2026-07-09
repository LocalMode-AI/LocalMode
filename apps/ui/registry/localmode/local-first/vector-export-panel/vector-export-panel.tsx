'use client';

import { Check, Download, FileDown, Loader2 } from 'lucide-react';

import { cn } from '@/registry/localmode/lib/utils';

/** An offered export format (e.g. native JSON, CSV, JSONL). */
export interface ExportFormat {
  /** Stable format id (passed to `onExport`, e.g. `"native-json"`, `"csv"`, `"jsonl"`). */
  id: string;
  /** Display label (e.g. "Native JSON"). */
  label: string;
  /** One-line description (e.g. "Full fidelity, re-importable"). */
  description?: string;
  /** Whether the format includes vectors (renders a "Vectors" / "Text only" indicator when set). */
  vectors?: boolean;
}

/** Summary of the most recent completed export. */
export interface LastExportSummary {
  /** The format that was exported. */
  formatId: string;
  /** Number of records exported. */
  records: number;
  /** Export size in bytes. */
  bytes: number;
  /** Downloaded filename. */
  filename?: string;
  /** When the export finished (preformatted display string, e.g. "just now"). */
  at?: string;
}

/** Props for {@link VectorExportPanel}. */
export interface VectorExportPanelProps {
  /** Export formats to offer, one action per format. */
  formats: ExportFormat[];
  /** Number of records currently in the corpus. Zero disables all actions. */
  recordCount: number;
  /** Vector dimensions of the corpus (shown next to the record count). */
  dimensions?: number;
  /**
   * Busy state: `true` disables all actions; a format id additionally renders
   * a spinner on that format's action.
   */
  exporting?: boolean | string;
  /** Summary of the last completed export (shown as a result banner). */
  lastExport?: LastExportSummary | null;
  /** Fired with the format id when the user activates a format's export action. */
  onExport: (formatId: string) => void;
  /** Disables all actions regardless of state. */
  disabled?: boolean;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/** Human-readable byte count (e.g. 49_664 → "48.5 KB"). */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit++;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/**
 * An export surface for vector data — the counterpart to `VectorImportFlow`:
 * a record/dimension count line, a row per export format (label, description,
 * vectors-included / text-only indicator, per-format export action emitting
 * `onExport(formatId)`), a busy state that disables all actions (with a
 * spinner on the active format), a zero-records disabled state, and an
 * optional last-export result banner (format, records, human-readable size,
 * filename). Renders whatever state the consumer passes back — works with any
 * backend; recommended producer: `useImportExport` (`exportCSV`,
 * `exportJSONL`) plus a native JSON export.
 *
 * @example
 * ```tsx
 * <VectorExportPanel
 *   formats={formats}
 *   recordCount={db.count}
 *   exporting={busyFormat}
 *   onExport={runExport}
 * />
 * ```
 */
export function VectorExportPanel({
  formats,
  recordCount,
  dimensions,
  exporting = false,
  lastExport,
  onExport,
  disabled = false,
  className,
}: VectorExportPanelProps) {
  const busy = exporting === true || typeof exporting === 'string';
  const busyFormatId = typeof exporting === 'string' ? exporting : null;
  const empty = recordCount === 0;
  const blocked = disabled || busy || empty;

  return (
    <div
      className={cn(
        'flex w-full max-w-lg flex-col gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm',
        className,
      )}
    >
      {/* Header + corpus counts */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileDown className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-semibold">Export corpus</span>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {recordCount.toLocaleString()} records
          {dimensions != null && <> · {dimensions}d</>}
        </span>
      </div>

      {/* Last-export result banner */}
      {lastExport && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
          <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden="true" />
          <div className="text-xs">
            <p className="font-medium text-emerald-700 dark:text-emerald-300">
              Exported {lastExport.records.toLocaleString()} records
            </p>
            <p className="text-muted-foreground">
              {(formats.find((f) => f.id === lastExport.formatId)?.label ??
                lastExport.formatId)}{' '}
              · {formatBytes(lastExport.bytes)}
              {lastExport.filename && <> · {lastExport.filename}</>}
              {lastExport.at && <> · {lastExport.at}</>}
            </p>
          </div>
        </div>
      )}

      {/* Format rows */}
      <ul className="flex flex-col gap-2">
        {formats.map((format) => {
          const isBusy = busyFormatId === format.id;
          return (
            <li
              key={format.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{format.label}</span>
                  {format.vectors != null && (
                    <span className="inline-flex shrink-0 items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {format.vectors ? 'Vectors' : 'Text only'}
                    </span>
                  )}
                </div>
                {format.description && (
                  <p className="truncate text-xs text-muted-foreground">
                    {format.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onExport(format.id)}
                disabled={blocked}
                aria-busy={isBusy}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
              >
                {isBusy ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="size-3.5" aria-hidden="true" />
                )}
                {isBusy ? 'Exporting…' : 'Export'}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Zero-records note */}
      {empty && (
        <p className="text-xs text-muted-foreground">
          Nothing to export yet - add records to the corpus first.
        </p>
      )}
    </div>
  );
}
