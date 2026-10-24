/**
 * Saved exports on /bench/run: every finished run the page exports is kept in
 * IndexedDB (`finished-runs` in the bench's own database) BEFORE the page
 * tries to download it. A series downloads each run with a programmatic click
 * and then reloads for the next run; Chrome blocks a site's repeated automatic
 * downloads unless the user allows them, and the finished run otherwise lives
 * only in the page's memory, so a blocked download used to lose the run. The
 * record holds the exact bytes the download saves (`json`), so a file
 * downloaded later from the Saved exports panel is byte for byte the file the
 * series would have saved, and the collect and import tools accept it as is.
 * Records are kept until the user removes them; nothing deletes them by age
 * unless `SAVED_EXPORT_MAX_AGE_DAYS` is set. A profile control run's record
 * also keeps the run's raw profile files (`attachments`), downloadable from
 * the same panel.
 */

import type { BenchRunResult } from '@localmode/bench';
import { createStoredZip } from './stored-zip';
import { FINISHED_RUNS_STORE, hasIndexedDB, inStore } from './progress-db';

/**
 * Age after which saved exports are pruned when the page loads, in days.
 * `null` (the default) keeps every saved export until the user removes it.
 */
export const SAVED_EXPORT_MAX_AGE_DAYS: number | null = null;

/** Why a finished run was kept. */
export type SavedExportReason = 'series' | 'control' | 'publish-off' | 'submit-failed';

/** Metadata of a saved export, as the panel lists it (no file bytes). */
export interface SavedExportMeta {
  runId: string;
  /** File name the download uses: `localmode-bench-<runId>.json`. */
  fileName: string;
  /** Size of the file in bytes (UTF-8). */
  sizeBytes: number;
  suite: string;
  /** Control kind of a control run (`harness.control.kind`). */
  controlKind?: string;
  /** Series place, when the run belongs to a series. */
  series?: { id: string; index: number; count: number };
  /** The run's own `createdAt` (when it finished). */
  finishedAt: string;
  /** When the record was written. */
  savedAt: string;
  /** When the page last triggered a download of this file (automatic or from a click); absent if never. */
  exportedAt?: string;
  reason: SavedExportReason;
  /** Raw profile files kept with the run (a profile control run), without their bytes. */
  attachments?: SavedAttachmentMeta[];
}

/** A file kept beside a saved run (a profile control run's raw profile), without its bytes. */
export interface SavedAttachmentMeta {
  /** File name the download uses: `localmode-bench-<runId>-<suffix>`. */
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

/** A kept file with its bytes. */
export interface SavedAttachment extends SavedAttachmentMeta {
  bytes: Uint8Array<ArrayBuffer>;
}

/** A file a run hands over to be kept beside it: a name suffix, its type and bytes. */
export interface RunAttachment {
  name: string;
  contentType: string;
  bytes: Uint8Array<ArrayBuffer>;
}

/** A saved export with the file's exact text (and its attachments' bytes). */
export interface SavedExport extends Omit<SavedExportMeta, 'attachments'> {
  json: string;
  attachments?: SavedAttachment[];
}

/** File name of a file kept beside a run: `localmode-bench-<runId>-<suffix>`. */
export function runAttachmentFileName(runId: string, suffix: string): string {
  return `localmode-bench-${runId}-${suffix.replace(/[^\w.-]/g, '_')}`;
}

/**
 * The text of an exported run file: two-space indented JSON. Export JSON, the
 * series' automatic download and the Saved exports panel all use it, so the
 * three files are identical.
 *
 * @param data - The run (or any exported object).
 * @returns The file text.
 */
export function serializeRunExport(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** File name of a run export. */
export function runExportFileName(runId: string): string {
  return `localmode-bench-${runId}.json`;
}

/**
 * Build the saved record of a finished run (pure).
 *
 * @param run - The finished run, exactly as exported (with its digest).
 * @param reason - Why it is kept.
 * @param now - Time of saving.
 * @returns The record, with the export text in `json`.
 */
export function toSavedExport(run: BenchRunResult, reason: SavedExportReason, now: Date, attachments: RunAttachment[] = []): SavedExport {
  const json = serializeRunExport(run);
  const series = run.harness.series;
  const control = run.harness.control;
  return {
    runId: run.runId,
    fileName: runExportFileName(run.runId),
    sizeBytes: new TextEncoder().encode(json).length,
    suite: run.suite,
    ...(control ? { controlKind: control.kind } : {}),
    ...(series ? { series: { id: series.id, index: series.index, count: series.count } } : {}),
    finishedAt: run.createdAt,
    savedAt: now.toISOString(),
    reason,
    json,
    ...(attachments.length > 0
      ? {
          attachments: attachments.map((a) => ({
            fileName: runAttachmentFileName(run.runId, a.name),
            contentType: a.contentType,
            sizeBytes: a.bytes.byteLength,
            bytes: a.bytes,
          })),
        }
      : {}),
  };
}

/** Drop the file text from a record. */
export function toMeta(record: SavedExport): SavedExportMeta {
  const { json: _json, attachments, ...meta } = record;
  return attachments ? { ...meta, attachments: attachments.map(({ bytes: _bytes, ...a }) => a) } : meta;
}

/** Newest first: by `savedAt`, then by series index (later first), then by run id. */
export function sortSavedExports<T extends SavedExportMeta>(records: T[]): T[] {
  return [...records].sort(
    (a, b) =>
      b.savedAt.localeCompare(a.savedAt) ||
      (b.series?.index ?? 0) - (a.series?.index ?? 0) ||
      a.runId.localeCompare(b.runId),
  );
}

/** Records older than `maxAgeDays` (by `savedAt`); none when `maxAgeDays` is null. */
export function expiredSavedExports<T extends SavedExportMeta>(records: T[], maxAgeDays: number | null, now: Date): T[] {
  if (maxAgeDays === null) return [];
  const cutoff = now.getTime() - maxAgeDays * 86_400_000;
  return records.filter((r) => Date.parse(r.savedAt) < cutoff);
}

/**
 * Keep a finished run in the browser. Call it BEFORE downloading the file. A
 * run already saved keeps its record (saving twice changes nothing).
 *
 * @param run - The finished run, exactly as exported.
 * @param reason - Why it is kept.
 * @param attachments - Raw profile files to keep beside it (a profile control run).
 * @returns The saved record, or null where IndexedDB is unavailable or the write failed.
 */
export async function saveFinishedRun(
  run: BenchRunResult,
  reason: SavedExportReason,
  attachments: RunAttachment[] = [],
): Promise<SavedExport | null> {
  if (!hasIndexedDB()) return null;
  const record = toSavedExport(run, reason, new Date(), attachments);
  try {
    const existing = await inStore<SavedExport | undefined>(FINISHED_RUNS_STORE, 'readonly', (s) => s.get(run.runId));
    if (existing) return existing;
    await inStore(FINISHED_RUNS_STORE, 'readwrite', (s) => s.put(record));
    return record;
  } catch {
    return null;
  }
}

/** Record that a download of the saved run was triggered now. */
export async function markExported(runId: string, at: Date = new Date()): Promise<void> {
  if (!hasIndexedDB()) return;
  try {
    const existing = await inStore<SavedExport | undefined>(FINISHED_RUNS_STORE, 'readonly', (s) => s.get(runId));
    if (!existing) return;
    await inStore(FINISHED_RUNS_STORE, 'readwrite', (s) => s.put({ ...existing, exportedAt: at.toISOString() }));
  } catch {
    // The record itself is kept; only the time stamp is missing.
  }
}

/**
 * Keep a finished run in the browser, then download it: the record is
 * written (and committed) before `download` is called, and the downloaded
 * text is the stored text. A run already saved is downloaded from its record.
 *
 * @param run - The finished run, exactly as exported.
 * @param reason - Why it is kept.
 * @param download - Hands the file to the browser (text, file name).
 * @returns The saved record, or null when the browser could not keep it (the download still happens).
 */
export async function persistThenDownload(
  run: BenchRunResult,
  reason: SavedExportReason,
  download: (text: string, fileName: string) => void,
): Promise<SavedExport | null> {
  const saved = await saveFinishedRun(run, reason);
  download(saved?.json ?? serializeRunExport(run), runExportFileName(run.runId));
  if (saved) await markExported(run.runId);
  return saved;
}

/** Every saved export with its file text, newest first. */
export async function listSavedExportsWithFiles(): Promise<SavedExport[]> {
  if (!hasIndexedDB()) return [];
  try {
    const all = await inStore<SavedExport[]>(FINISHED_RUNS_STORE, 'readonly', (s) => s.getAll() as IDBRequest<SavedExport[]>);
    return sortSavedExports(all);
  } catch {
    return [];
  }
}

/** Every saved export without the file text, newest first. */
export async function listSavedExports(): Promise<SavedExportMeta[]> {
  return (await listSavedExportsWithFiles()).map(toMeta);
}

/** One saved export with its file text. */
export async function getSavedExport(runId: string): Promise<SavedExport | null> {
  if (!hasIndexedDB()) return null;
  try {
    return (await inStore<SavedExport | undefined>(FINISHED_RUNS_STORE, 'readonly', (s) => s.get(runId))) ?? null;
  } catch {
    return null;
  }
}

/** Remove a saved export (the user's Remove). */
export async function removeSavedExport(runId: string): Promise<void> {
  if (!hasIndexedDB()) return;
  await inStore(FINISHED_RUNS_STORE, 'readwrite', (s) => s.delete(runId));
}

/**
 * Remove saved exports older than `maxAgeDays`. With the default (`null`)
 * nothing is removed.
 *
 * @returns The run ids removed.
 */
export async function pruneSavedExports(
  maxAgeDays: number | null = SAVED_EXPORT_MAX_AGE_DAYS,
  now: Date = new Date(),
): Promise<string[]> {
  if (maxAgeDays === null || !hasIndexedDB()) return [];
  const expired = expiredSavedExports(await listSavedExports(), maxAgeDays, now);
  for (const r of expired) await removeSavedExport(r.runId);
  return expired.map((r) => r.runId);
}

/** File name of the "Download all" archive. */
export function savedExportsArchiveName(now: Date): string {
  return `localmode-bench-saved-exports-${now.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.zip`;
}

/**
 * The "Download all" archive: one stored (uncompressed) entry per saved
 * export, named as its single download is, holding the same bytes, followed
 * by its attachments (raw profile files), each under its own file name.
 *
 * @param records - Saved exports with their file text.
 * @returns The ZIP bytes.
 */
export function savedExportsArchive(records: SavedExport[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  return createStoredZip(
    records.flatMap((r) => [
      { name: r.fileName, data: encoder.encode(r.json), modified: new Date(r.finishedAt) },
      ...(r.attachments ?? []).map((a) => ({ name: a.fileName, data: a.bytes, modified: new Date(r.finishedAt) })),
    ]),
  );
}

/** "1.2 MB" / "340 KB" / "512 B". */
export function formatSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} B`;
}
