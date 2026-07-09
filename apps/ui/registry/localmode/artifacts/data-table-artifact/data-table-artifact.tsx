'use client';

/**
 * @file data-table-artifact.tsx
 * @description Generic sortable data table for rendering LOCAL row data —
 * VectorDB search results, model-catalog rows, evaluation rows, or
 * `generateObject()` array output. Sorting is performed entirely client-side.
 * Distinct from the inline `ScoredResultBarList`: this is a docked-canvas table.
 */

import * as React from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/registry/localmode/lib/utils';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from '@/registry/localmode/ui/table';

/** A column definition for {@link DataTableArtifact}. */
export interface DataTableColumn<Row> {
  /** Key into the row object (used as the default accessor and sort key). */
  key: keyof Row & string;
  /** Header label. Defaults to `key`. */
  header?: string;
  /** Custom cell renderer. Defaults to `String(row[key])`. */
  cell?: (row: Row) => React.ReactNode;
  /** When false, the column header is not clickable to sort. @default true */
  sortable?: boolean;
  /** Align the column's text. @default "left" */
  align?: 'left' | 'right' | 'center';
}

/** Props for {@link DataTableArtifact}. */
export interface DataTableArtifactProps<Row extends Record<string, unknown>> {
  /** The rows to render. Sorting reorders a copy; the input array is untouched. */
  rows: Row[];
  /**
   * Column definitions. When omitted, columns are inferred from the keys of the
   * first row.
   */
  columns?: DataTableColumn<Row>[];
  /** Optional caption rendered under the table. */
  caption?: React.ReactNode;
  /** Initial sort column key. */
  initialSortKey?: keyof Row & string;
  /** Initial sort direction. @default "asc" */
  initialSortDirection?: 'asc' | 'desc';
  /** Message shown when `rows` is empty. @default "No data" */
  emptyMessage?: React.ReactNode;
  /** Additional class names merged onto the root wrapper. */
  className?: string;
}

type SortState<Row> = {
  key: keyof Row & string;
  direction: 'asc' | 'desc';
} | null;

/** Compare two arbitrary cell values for sorting (numbers, strings, dates, bools). */
function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean')
    return Number(a) - Number(b);
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/**
 * A docked-canvas sortable data table. Click a sortable column header to sort
 * the rows ascending → descending → unsorted, all client-side. Renders any
 * local row data (VectorDB results, model catalog, eval rows,
 * `generateObject()` arrays).
 *
 * Styled with shadcn/ui CSS variables so it inherits the consumer's theme.
 *
 * @example
 * ```tsx
 * <DataTableArtifact
 *   rows={results}
 *   columns={[
 *     { key: 'id', header: 'ID' },
 *     { key: 'score', header: 'Score', align: 'right' },
 *   ]}
 * />
 * ```
 */
export function DataTableArtifact<Row extends Record<string, unknown>>({
  rows,
  columns,
  caption,
  initialSortKey,
  initialSortDirection = 'asc',
  emptyMessage = 'No data',
  className,
}: DataTableArtifactProps<Row>) {
  const resolvedColumns: DataTableColumn<Row>[] = React.useMemo(() => {
    if (columns && columns.length > 0) return columns;
    const first = rows[0];
    if (!first) return [];
    return (Object.keys(first) as (keyof Row & string)[]).map((key) => ({
      key,
    }));
  }, [columns, rows]);

  const [sort, setSort] = React.useState<SortState<Row>>(
    initialSortKey
      ? { key: initialSortKey, direction: initialSortDirection }
      : null,
  );

  const sortedRows = React.useMemo(() => {
    if (!sort) return rows;
    const copy = [...rows];
    copy.sort((rowA, rowB) => {
      const result = compareValues(rowA[sort.key], rowB[sort.key]);
      return sort.direction === 'asc' ? result : -result;
    });
    return copy;
  }, [rows, sort]);

  const toggleSort = (key: keyof Row & string) => {
    setSort((current) => {
      if (!current || current.key !== key) return { key, direction: 'asc' };
      if (current.direction === 'asc') return { key, direction: 'desc' };
      return null; // third click clears the sort
    });
  };

  if (rows.length === 0) {
    return (
      <div
        data-slot="data-table-artifact"
        className={cn(
          'rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground',
          className,
        )}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      data-slot="data-table-artifact"
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-card',
        className,
      )}
    >
      <div className="sm:hidden">
        <div className="divide-y divide-border">
          {sortedRows.map((row, rowIndex) => (
            <dl key={rowIndex} className="space-y-2 p-3">
              {resolvedColumns.map((column) => (
                <div
                  key={column.key}
                  className="grid grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)] gap-3 text-sm"
                >
                  <dt className="min-w-0 text-xs font-medium text-muted-foreground">
                    <span className="block truncate">
                      {column.header ?? column.key}
                    </span>
                  </dt>
                  <dd
                    className={cn(
                      'min-w-0 break-words text-foreground [overflow-wrap:anywhere]',
                      column.align === 'right' && 'text-right tabular-nums',
                      column.align === 'center' && 'text-center',
                    )}
                  >
                    {column.cell
                      ? column.cell(row)
                      : formatCell(row[column.key])}
                  </dd>
                </div>
              ))}
            </dl>
          ))}
        </div>
        {caption ? (
          <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            {caption}
          </p>
        ) : null}
      </div>

      <div className="hidden overflow-x-auto sm:block">
        <Table className="table-fixed">
          {caption ? <TableCaption>{caption}</TableCaption> : null}
          <TableHeader>
            <TableRow>
              {resolvedColumns.map((column) => {
                const isSortable = column.sortable !== false;
                const isActive = sort?.key === column.key;
                const alignClass =
                  column.align === 'right'
                    ? 'text-right'
                    : column.align === 'center'
                      ? 'text-center'
                      : 'text-left';
                return (
                  <TableHead
                    key={column.key}
                    aria-sort={
                      isActive
                        ? sort.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                    className={cn('min-w-0', alignClass)}
                  >
                    {isSortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        className={cn(
                          'inline-flex max-w-full min-w-0 items-center gap-1 rounded-sm font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          isActive ? 'text-foreground' : 'text-muted-foreground',
                          column.align === 'right' && 'flex-row-reverse',
                        )}
                      >
                        <span className="min-w-0 truncate">
                          {column.header ?? column.key}
                        </span>
                        {isActive ? (
                          sort.direction === 'asc' ? (
                            <ChevronUp className="size-3.5 shrink-0" aria-hidden="true" />
                          ) : (
                            <ChevronDown
                              className="size-3.5 shrink-0"
                              aria-hidden="true"
                            />
                          )
                        ) : (
                          <ChevronsUpDown
                            className="size-3.5 shrink-0 opacity-50"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    ) : (
                      (column.header ?? column.key)
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {resolvedColumns.map((column) => {
                  const alignClass =
                    column.align === 'right'
                      ? 'text-right'
                      : column.align === 'center'
                        ? 'text-center'
                        : 'text-left';
                  return (
                    <TableCell
                      key={column.key}
                      className={cn(
                        'min-w-0 max-w-[14rem] truncate',
                        alignClass,
                      )}
                      title={
                        column.cell ? undefined : String(row[column.key] ?? '')
                      }
                    >
                      {column.cell
                        ? column.cell(row)
                        : formatCell(row[column.key])}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/** Render a primitive cell value as text; objects fall back to JSON. */
function formatCell(value: unknown): React.ReactNode {
  if (value == null) return '';
  if (typeof value === 'number') return value.toLocaleString();
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
