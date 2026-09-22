'use client';

/**
 * @file leaderboard-table.tsx
 * @description Filterable leaderboard table for the /bench page. Pure
 * presentation over pre-aggregated rows; filters are client-side.
 */

import { useMemo, useState } from 'react';
import type { IndexLeaderboardRow } from '@/lib/bench/store';
import { Badge } from '@/registry/localmode/ui/badge';
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
  const [device, setDevice] = useState(ALL);
  const [runtime, setRuntime] = useState(ALL);
  const [model, setModel] = useState(ALL);

  const devices = useMemo(() => [...new Set(rows.map((r) => r.deviceSubclass))].sort(), [rows]);
  const runtimes = useMemo(() => [...new Set(rows.map((r) => r.runtimeId))].sort(), [rows]);
  const models = useMemo(() => [...new Set(rows.map((r) => r.benchModelId))].sort(), [rows]);

  const filtered = rows.filter(
    (r) =>
      (device === ALL || r.deviceSubclass === device) &&
      (runtime === ALL || r.runtimeId === runtime) &&
      (model === ALL || r.benchModelId === model),
  );

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {(
          [
            ['Device', device, setDevice, devices],
            ['Runtime', runtime, setRuntime, runtimes],
            ['Model', model, setModel, models],
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
            {filtered.map((r) => (
              <TableRow key={`${r.deviceSubclass}|${r.runtimeId}|${r.benchModelId}|${r.workloadId}`}>
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
    </div>
  );
}
