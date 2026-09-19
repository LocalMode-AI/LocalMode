/**
 * @file submissions-table.tsx
 * @description Recent verified submissions for the /bench page: one row per
 * run with the device identity the run disclosed (browser, OS, GPU model,
 * cores, memory, form factor). Server-renderable; no client state.
 */

import type { RunIndexEntry } from '@/lib/bench/store';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/registry/localmode/ui/table';

function fmtGB(bytes?: number): string {
  if (bytes === undefined) return '—';
  return `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1)} GB`;
}

/** Runs-with-dataset-link path: the run JSON inside the public repository. */
function runUrl(repo: string | null, entry: RunIndexEntry): string | undefined {
  return repo ? `https://github.com/${repo}/blob/main/${entry.path}` : undefined;
}

export function SubmissionsTable({
  entries,
  repo,
  limit = 25,
}: {
  entries: RunIndexEntry[];
  repo: string | null;
  limit?: number;
}) {
  const recent = [...entries]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
  if (recent.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Run</TableHead>
            <TableHead>Suite</TableHead>
            <TableHead>Device class</TableHead>
            <TableHead>Device</TableHead>
            <TableHead>GPU</TableHead>
            <TableHead>Browser</TableHead>
            <TableHead>OS</TableHead>
            <TableHead className="text-right">Cores</TableHead>
            <TableHead className="text-right">Memory</TableHead>
            <TableHead className="text-right">Storage quota</TableHead>
            <TableHead>Isolation</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {recent.map((e) => {
            const href = runUrl(repo, e);
            const shortId = e.runId.slice(0, 8);
            const when = e.createdAt.slice(0, 10);
            return (
              <TableRow key={e.runId}>
                <TableCell className="font-mono text-xs">
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                      {shortId}
                    </a>
                  ) : (
                    shortId
                  )}
                  <span className="block text-muted-foreground">{when}</span>
                </TableCell>
                <TableCell>{e.suite}</TableCell>
                <TableCell className="font-mono text-xs">{e.deviceClass}</TableCell>
                <TableCell>
                  {e.deviceType ?? '—'}
                  {e.deviceModel && <span className="block text-xs text-muted-foreground">{e.deviceModel}</span>}
                  {e.userReportedDevice && !e.userReportedDevice.startsWith('prolific:') && (
                    <span className="block text-xs text-muted-foreground" title="Self-reported by the submitter, not verified">
                      {e.userReportedDevice}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {e.gpuModel ?? e.gpuVendor ?? '—'}
                  {e.gpuArchitecture && (
                    <span className="block text-xs text-muted-foreground">{e.gpuArchitecture}</span>
                  )}
                </TableCell>
                <TableCell>
                  {e.browser} {e.browserVersion}
                  {e.engine && <span className="block text-xs text-muted-foreground">{e.engine}</span>}
                </TableCell>
                <TableCell>
                  {e.os}
                  {e.osVersion && e.osVersion !== 'unknown-frozen' && ` ${e.osVersion}`}
                  {e.architecture && (
                    <span className="block text-xs text-muted-foreground">{e.architecture}</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{e.cores ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {e.deviceMemoryGB !== undefined ? (
                    <span title="navigator.deviceMemory, which browsers cap at 8 GB">{e.deviceMemoryGB} GB+</span>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmtGB(e.storageQuotaBytes)}</TableCell>
                <TableCell className="text-xs">
                  {e.crossOriginIsolated === undefined ? '—' : e.crossOriginIsolated ? 'isolated' : 'not isolated'}
                  {e.webgpu !== undefined && (
                    <span className="block text-muted-foreground">{e.webgpu ? 'WebGPU' : 'no WebGPU'}</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
