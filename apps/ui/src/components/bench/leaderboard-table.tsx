'use client';

/**
 * @file leaderboard-table.tsx
 * @description Filterable, paginated leaderboard table for the /bench page.
 * Pure presentation over pre-aggregated rows; filters and paging are
 * client-side (25 rows a page by default; a filter change returns to page 1).
 */

import { useMemo, useState } from 'react';
import type { IndexLeaderboardRow } from '@/lib/bench/store';
import { LEADERBOARD_DEFAULT_PAGE_SIZE, LEADERBOARD_PAGE_SIZES, pageWindow } from '@/lib/bench/paginate';
import { Badge } from '@/registry/localmode/ui/badge';
import { Button } from '@/registry/localmode/ui/button';
import { Label } from '@/registry/localmode/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/registry/localmode/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/registry/localmode/ui/table';

const ALL = 'all';

function fmtMs(v?: number): string {
  if (v === undefined) return '—';
  return v >= 10_000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`;
}

export function LeaderboardTable({ rows }: { rows: IndexLeaderboardRow[] }) {
  const [protocol, setProtocol] = useState(ALL);
  const [device, setDevice] = useState(ALL);
  const [runtime, setRuntime] = useState(ALL);
  const [model, setModel] = useState(ALL);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(LEADERBOARD_DEFAULT_PAGE_SIZE);
  // A filter change starts from page 1; the window also clamps if the list shrinks.
  const filterSetter = (set: (v: string) => void) => (v: string) => {
    set(v);
    setPage(1);
  };

  // Newest protocol first; rows never mix versions, so the filter is exact.
  const protocols = useMemo(
    () => [...new Set(rows.map((r) => r.protocol))].sort((a, b) => b.localeCompare(a, undefined, { numeric: true })),
    [rows],
  );
  const devices = useMemo(() => [...new Set(rows.map((r) => r.deviceSubclass))].sort(), [rows]);
  const runtimes = useMemo(() => [...new Set(rows.map((r) => r.runtimeId))].sort(), [rows]);
  const models = useMemo(() => [...new Set(rows.map((r) => r.benchModelId))].sort(), [rows]);

  const filtered = rows.filter(
    (r) =>
      (protocol === ALL || r.protocol === protocol) &&
      (device === ALL || r.deviceSubclass === device) &&
      (runtime === ALL || r.runtimeId === runtime) &&
      (model === ALL || r.benchModelId === model),
  );

  const win = pageWindow(filtered.length, page, pageSize);
  const pageRows = filtered.slice(win.start, win.end);

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {(
          [
            ['Protocol', protocol, filterSetter(setProtocol), protocols],
            ['Device', device, filterSetter(setDevice), devices],
            ['Runtime', runtime, filterSetter(setRuntime), runtimes],
            ['Model', model, filterSetter(setModel), models],
          ] as const
        ).map(([label, value, setter, options]) => (
          <div key={label} className="flex items-center gap-2">
            <Label htmlFor={`bench-filter-${label}`}>{label}</Label>
            <Select value={value} onValueChange={setter}>
              <SelectTrigger id={`bench-filter-${label}`} className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All</SelectItem>
                {options.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Protocol</TableHead>
              <TableHead>Device class</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Runtime</TableHead>
              <TableHead>Workload</TableHead>
              <TableHead className="text-right">TTFT</TableHead>
              <TableHead className="text-right">Decode chars/s</TableHead>
              <TableHead className="text-right">Embed</TableHead>
              <TableHead className="text-right">Load cold/warm</TableHead>
              <TableHead className="text-right">Quality</TableHead>
              <TableHead className="text-right">Runs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((r) => (
              <TableRow key={`${r.protocol}|${r.deviceSubclass}|${r.runtimeId}|${r.benchModelId}|${r.workloadId}`}>
                <TableCell className="font-mono text-xs">{r.protocol.replace('localmode-bench/', 'v')}</TableCell>
                <TableCell className="font-mono text-xs">
                  {r.deviceSubclass}
                  {r.deviceSubclass !== r.deviceClass && (
                    <span className="block text-muted-foreground" title="Coarse class: platform and WebGPU vendor-architecture">
                      {r.deviceClass}
                    </span>
                  )}
                </TableCell>
                <TableCell>{r.modelName}</TableCell>
                <TableCell>
                  {r.runtimeId}
                  <span className="text-xs text-muted-foreground"> ({r.resolvedBackends.join(', ')})</span>
                </TableCell>
                <TableCell className="font-mono text-xs">{r.workloadId}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtMs(r.ttftMs)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.decodeCharsPerSec !== undefined ? (
                    Math.round(r.decodeCharsPerSec)
                  ) : r.overallCharsPerSec !== undefined ? (
                    <span title="End-to-end rate (prefill + decode). This runtime's stream is not incremental, so a pure decode rate cannot be measured.">
                      {Math.round(r.overallCharsPerSec)}
                      <span className="text-xs text-muted-foreground"> e2e</span>
                    </span>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.singleLatencyMs !== undefined
                    ? fmtMs(r.singleLatencyMs)
                    : r.batchTextsPerSec !== undefined
                      ? `${Math.round(r.batchTextsPerSec)}/s`
                      : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtMs(r.loadColdMs)} / {fmtMs(r.loadWarmMs)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.qualityScore !== undefined ? r.qualityScore.toFixed(3) : '—'}
                  {r.qualityParseRate !== undefined && r.qualityParseRate < 1 && (
                    <span
                      className="text-xs text-muted-foreground"
                      title="Share of items whose answer could be parsed. Unparsed items count as wrong, so a low share means the score is limited by output format, not fidelity."
                    >
                      {' '}({Math.round(r.qualityParseRate * 100)}% parsed)
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {r.submissions}
                  {r.provisional && (
                    <Badge variant="outline" className="ml-2">
                      provisional
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <nav aria-label="Leaderboard pages" className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p role="status" aria-live="polite" className="text-muted-foreground">
          {win.label}
          {win.pageCount > 1 && ` · page ${win.page} of ${win.pageCount}`}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="bench-page-size">Rows per page</Label>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger id="bench-page-size" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEADERBOARD_PAGE_SIZES.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage(win.page - 1)}
              disabled={win.page <= 1}
              aria-label="Previous page"
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage(win.page + 1)}
              disabled={win.page >= win.pageCount}
              aria-label="Next page"
            >
              Next
            </Button>
          </div>
        </div>
      </nav>
    </div>
  );
}
