'use client';

/**
 * Saved exports on /bench/run: the finished runs this browser kept in
 * IndexedDB (see src/lib/bench/saved-exports.ts), each downloadable again
 * from a click. A click carries user activation, so Chrome allows the
 * download even where it blocked the page's automatic ones; "Download all"
 * saves one ZIP archive (one download per click) whose files are byte for
 * byte the files a single download saves.
 */

import { useCallback, useState } from 'react';
import { triggerDownload, triggerTextDownload } from '@/lib/bench/download';
import {
  formatSize,
  getSavedExport,
  listSavedExportsWithFiles,
  markExported,
  removeSavedExport,
  savedExportsArchive,
  savedExportsArchiveName,
  type SavedExportMeta,
} from '@/lib/bench/saved-exports';
import { Button } from '@/registry/localmode/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/registry/localmode/ui/card';

const REASON_TEXT: Record<SavedExportMeta['reason'], string> = {
  series: 'series run',
  control: 'control run',
  'publish-off': 'publishing off',
  'submit-failed': 'upload failed',
};

/** Short run id for the list (the full id is in the file name and the title attribute). */
function shortId(runId: string): string {
  return runId.length > 13 ? `${runId.slice(0, 8)}…${runId.slice(-4)}` : runId;
}

export interface SavedExportsPanelProps {
  /** Saved exports to list (metadata only), newest first. */
  exports: SavedExportMeta[];
  /** Called after a download or removal changed the store, so the owner reloads the list. */
  onChanged: () => void;
}

/** The Saved exports card; renders nothing when no run is saved. */
export function SavedExportsPanel({ exports, onChanged }: SavedExportsPanelProps) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const downloadOne = useCallback(
    async (runId: string) => {
      const record = await getSavedExport(runId);
      if (!record) {
        setMessage('That run is no longer saved in this browser.');
        onChanged();
        return;
      }
      triggerTextDownload(record.json, record.fileName);
      await markExported(runId);
      setMessage(`Download started: ${record.fileName}`);
      onChanged();
    },
    [onChanged],
  );

  const downloadAll = useCallback(async () => {
    setBusy(true);
    try {
      const records = await listSavedExportsWithFiles();
      if (records.length === 0) {
        setMessage('No run is saved in this browser.');
        return;
      }
      const name = savedExportsArchiveName(new Date());
      triggerDownload(new Blob([savedExportsArchive(records)], { type: 'application/zip' }), name);
      const at = new Date();
      for (const r of records) await markExported(r.runId, at);
      setMessage(`Download started: ${name} (${records.length} run file${records.length === 1 ? '' : 's'})`);
    } finally {
      setBusy(false);
      onChanged();
    }
  }, [onChanged]);

  const remove = useCallback(
    async (runId: string) => {
      setConfirming(null);
      try {
        await removeSavedExport(runId);
        setMessage(`Removed ${runId} from this browser.`);
      } catch {
        setMessage(`Could not remove ${runId}; it is still saved.`);
      }
      onChanged();
    },
    [onChanged],
  );

  if (exports.length === 0) return null;
  const total = exports.reduce((acc, r) => acc + r.sizeBytes, 0);
  return (
    <Card role="region" aria-label="Saved exports">
      <CardHeader>
        <CardTitle>Saved exports</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p className="text-muted-foreground">
          {exports.length} finished run{exports.length === 1 ? ' is' : 's are'} saved in this browser ({formatSize(total)}).
          Each run&apos;s JSON is kept here before the page tries to download it, so a download the
          browser blocked is not lost. Download a run, or all of them as one .zip of the same files,
          then remove what you no longer need. Nothing here is removed by itself.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void downloadAll()} disabled={busy} aria-busy={busy}>
            Download all (.zip)
          </Button>
        </div>
        {message && (
          <p role="status" className="text-xs text-muted-foreground">
            {message}
          </p>
        )}
        <ul className="flex flex-col gap-2" aria-label="Saved runs">
          {exports.map((r) => {
            const label = `run ${shortId(r.runId)}`;
            return (
              <li
                key={r.runId}
                aria-label={`Saved run ${r.runId}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <div className="min-w-0">
                  <div className="font-medium">
                    <span className="font-mono" title={r.runId}>
                      {shortId(r.runId)}
                    </span>{' '}
                    · {r.suite} suite
                    {r.controlKind ? ` · control: ${r.controlKind}` : ''}
                    {r.series ? ` · series run ${r.series.index} of ${r.series.count}` : ''}
                  </div>
                  <div className="break-words text-xs text-muted-foreground">
                    finished {new Date(r.finishedAt).toLocaleString()} · {formatSize(r.sizeBytes)} · {REASON_TEXT[r.reason]} ·{' '}
                    {r.exportedAt ? `download last started ${new Date(r.exportedAt).toLocaleString()}` : 'not downloaded yet'}
                  </div>
                </div>
                {confirming === r.runId ? (
                  <div role="group" aria-label={`Confirm removing ${label}`} className="flex flex-wrap items-center gap-2">
                    <span className="text-xs">Remove this run from the browser? This cannot be undone.</span>
                    <Button size="sm" variant="destructive" onClick={() => void remove(r.runId)} aria-label={`Remove ${label} for good`}>
                      Remove
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setConfirming(null)} aria-label={`Keep ${label}`}>
                      Keep
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => void downloadOne(r.runId)} aria-label={`Download ${label}`}>
                      Download
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(r.runId)} aria-label={`Remove ${label}`}>
                      Remove
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
