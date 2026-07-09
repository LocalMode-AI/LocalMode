'use client';

/**
 * @file code-diff-viewer.tsx
 * @description Side-by-side / unified text-or-code diff of two LOCAL strings,
 * showing additions and deletions. The line diff is computed entirely
 * client-side with a dependency-free LCS algorithm — no ML hook, no server.
 * Complements the image-only `BeforeAfterImageViewer`: use this for before/after
 * of redacted (`redactPII`), translated (`translate`), or transformed text and
 * prompt edits.
 */

import * as React from 'react';
import { cn } from '@/registry/localmode/lib/utils';

/** A single diff row in unified view. */
interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  /** Line number in the original (omitted for added lines). */
  oldLine?: number;
  /** Line number in the modified (omitted for removed lines). */
  newLine?: number;
  text: string;
}

/** A paired row in split view: left = original, right = modified. */
interface SplitRow {
  left?: { line: number; text: string; changed: boolean };
  right?: { line: number; text: string; changed: boolean };
}

/** Props for {@link CodeDiffViewer}. */
export interface CodeDiffViewerProps {
  /** The original ("before") string. */
  original: string;
  /** The modified ("after") string. */
  modified: string;
  /** Display mode. @default "unified" */
  mode?: 'unified' | 'split';
  /** Label for the original side (split header / unified caption). @default "Original" */
  originalLabel?: string;
  /** Label for the modified side. @default "Modified" */
  modifiedLabel?: string;
  /** When false, line numbers are hidden. @default true */
  showLineNumbers?: boolean;
  /** Additional class names merged onto the root wrapper. */
  className?: string;
}

/**
 * A unified or side-by-side text/code diff viewer over two local strings.
 * Additions are highlighted green, deletions red. The diff is computed in-browser
 * via a longest-common-subsequence line match — nothing leaves the device.
 *
 * Styled with shadcn/ui CSS variables so it inherits the consumer's theme.
 *
 * @example
 * ```tsx
 * <CodeDiffViewer
 *   original={beforeRedaction}
 *   modified={afterRedaction}
 *   mode="split"
 *   originalLabel="Raw"
 *   modifiedLabel="Redacted"
 * />
 * ```
 */
export function CodeDiffViewer({
  original,
  modified,
  mode = 'unified',
  originalLabel = 'Original',
  modifiedLabel = 'Modified',
  showLineNumbers = true,
  className,
}: CodeDiffViewerProps) {
  const lines = React.useMemo(
    () => diffLines(original, modified),
    [original, modified],
  );

  const added = lines.filter((l) => l.type === 'added').length;
  const removed = lines.filter((l) => l.type === 'removed').length;

  return (
    <div
      data-slot="code-diff-viewer"
      data-mode={mode}
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-card font-mono text-xs',
        className,
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-border px-3 py-2 font-sans text-xs text-muted-foreground">
        <span className="min-w-0 truncate" title={`${originalLabel} -> ${modifiedLabel}`}>
          {originalLabel} → {modifiedLabel}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-emerald-600 dark:text-emerald-400">
            +{added}
          </span>
          <span className="text-red-600 dark:text-red-400">−{removed}</span>
        </span>
      </div>
      {mode === 'split' ? (
        <SplitView
          lines={lines}
          showLineNumbers={showLineNumbers}
          originalLabel={originalLabel}
          modifiedLabel={modifiedLabel}
        />
      ) : (
        <UnifiedView lines={lines} showLineNumbers={showLineNumbers} />
      )}
    </div>
  );
}

/** Unified (single-column) rendering of the diff lines. */
function UnifiedView({
  lines,
  showLineNumbers,
}: {
  lines: DiffLine[];
  showLineNumbers: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, i) => (
            <tr
              key={i}
              className={cn(
                line.type === 'added' &&
                  'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                line.type === 'removed' &&
                  'bg-red-500/10 text-red-700 dark:text-red-300',
              )}
            >
              {showLineNumbers ? (
                <td className="select-none border-r border-border px-2 text-right align-top text-muted-foreground">
                  {line.oldLine ?? ''}
                </td>
              ) : null}
              {showLineNumbers ? (
                <td className="select-none border-r border-border px-2 text-right align-top text-muted-foreground">
                  {line.newLine ?? ''}
                </td>
              ) : null}
              <td className="select-none px-2 align-top text-muted-foreground">
                {line.type === 'added'
                  ? '+'
                  : line.type === 'removed'
                    ? '−'
                    : ' '}
              </td>
              <td className="w-full whitespace-pre-wrap break-all px-2 align-top">
                {line.text || ' '}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Side-by-side (two-column) rendering of the diff. */
function SplitView({
  lines,
  showLineNumbers,
  originalLabel,
  modifiedLabel,
}: {
  lines: DiffLine[];
  showLineNumbers: boolean;
  originalLabel: string;
  modifiedLabel: string;
}) {
  const rows = toSplitRows(lines);
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          {showLineNumbers ? <col className="w-10" /> : null}
          <col />
          {showLineNumbers ? <col className="w-10" /> : <col className="w-0" />}
          <col />
        </colgroup>
        <thead>
          <tr className="border-b border-border font-sans text-muted-foreground">
            <th
              colSpan={showLineNumbers ? 2 : 1}
              className="px-2 py-1 text-left font-medium"
            >
              {originalLabel}
            </th>
            <th
              colSpan={showLineNumbers ? 2 : 1}
              className="border-l border-border px-2 py-1 text-left font-medium"
            >
              {modifiedLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {showLineNumbers ? (
                <td className="select-none px-2 text-right align-top tabular-nums text-muted-foreground">
                  {row.left?.line ?? ''}
                </td>
              ) : null}
              <td
                className={cn(
                  'whitespace-pre-wrap break-all px-2 align-top',
                  row.left?.changed &&
                    'bg-red-500/10 text-red-700 dark:text-red-300',
                )}
              >
                {row.left ? row.left.text || ' ' : ''}
              </td>
              {showLineNumbers ? (
                <td className="select-none border-l border-border px-2 text-right align-top tabular-nums text-muted-foreground">
                  {row.right?.line ?? ''}
                </td>
              ) : (
                <td className="w-0 border-l border-border p-0" />
              )}
              <td
                className={cn(
                  'whitespace-pre-wrap break-all px-2 align-top',
                  row.right?.changed &&
                    'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                )}
              >
                {row.right ? row.right.text || ' ' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Compute a line-level diff between two strings using an LCS dynamic-program.
 * Returns an ordered list of added / removed / unchanged lines.
 */
function diffLines(original: string, modified: string): DiffLine[] {
  const a = original.split('\n');
  const b = modified.split('\n');
  const n = a.length;
  const m = b.length;

  // LCS length table.
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({
        type: 'unchanged',
        oldLine: i + 1,
        newLine: j + 1,
        text: a[i],
      });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      result.push({ type: 'removed', oldLine: i + 1, text: a[i] });
      i++;
    } else {
      result.push({ type: 'added', newLine: j + 1, text: b[j] });
      j++;
    }
  }
  while (i < n) {
    result.push({ type: 'removed', oldLine: i + 1, text: a[i] });
    i++;
  }
  while (j < m) {
    result.push({ type: 'added', newLine: j + 1, text: b[j] });
    j++;
  }
  return result;
}

/** Pair removed/added runs into side-by-side rows for split view. */
function toSplitRows(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let k = 0;
  while (k < lines.length) {
    const line = lines[k];
    if (line.type === 'unchanged') {
      rows.push({
        left: { line: line.oldLine!, text: line.text, changed: false },
        right: { line: line.newLine!, text: line.text, changed: false },
      });
      k++;
      continue;
    }
    // Collect a contiguous run of removed then added lines and zip them.
    const removed: DiffLine[] = [];
    const added: DiffLine[] = [];
    while (k < lines.length && lines[k].type === 'removed')
      removed.push(lines[k++]);
    while (k < lines.length && lines[k].type === 'added')
      added.push(lines[k++]);
    const max = Math.max(removed.length, added.length);
    for (let r = 0; r < max; r++) {
      rows.push({
        left: removed[r]
          ? { line: removed[r].oldLine!, text: removed[r].text, changed: true }
          : undefined,
        right: added[r]
          ? { line: added[r].newLine!, text: added[r].text, changed: true }
          : undefined,
      });
    }
  }
  return rows;
}
