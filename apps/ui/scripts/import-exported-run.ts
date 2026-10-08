/**
 * Add a run to a LocalMode Bench dataset clone from the JSON file a
 * participant exported, for a finished run whose upload never went through
 * (an expired session token, a dropped connection, a closed tab). The file
 * goes through the submit route's own pipeline from
 * `src/lib/bench/submission.ts`: the 4 MB size cap and JSON parsing, digest
 * verification, shape validation with the quarantine decision, the
 * publication scrub (the nonce is never published), the dataset path, the
 * run file bytes, and the index entry from `toIndexEntry()`. Two steps of the
 * route are left out: the nonce check (an exported file's nonce has expired
 * by the time it reaches a maintainer) and the GitHub writes (the run file
 * and `index/summary.json` are written into the clone instead).
 *
 * The run file is exactly what the route would have committed for the same
 * body; its digest-covered content is untouched. The index entry carries one
 * extra key, `importedAt` (ISO time of the import), so imported runs stay
 * distinguishable from submitted ones; the index rebuild tool keeps it. A run
 * id that the index or a run file already holds is refused.
 *
 * Usage (from apps/ui):
 *   pnpm exec tsx scripts/import-exported-run.ts --dataset ../../../LocalMode-Bench --file export.json --dry-run
 *   pnpm exec tsx scripts/import-exported-run.ts --dataset ../../../LocalMode-Bench --file export.json
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PlausibilityFlag } from '@localmode/bench';
import type { RunIndexEntry } from '../src/lib/bench/store';
import {
  appendIndexEntry,
  checkSubmission,
  parseSubmissionBody,
  publicationOf,
  serializeIndexEntries,
  toPublishedRun,
  type SubmissionRejection,
} from '../src/lib/bench/submission';

/** Dataset-relative path of the index. */
export const INDEX_FILE = 'index/summary.json';

export class ImportRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportRunError';
  }
}

export interface ImportRunOptions {
  datasetDir: string;
  /** Path of the exported run file. */
  file: string;
  dryRun?: boolean;
  /** Time recorded as `importedAt` (and as `scrubbedAt` if the scrub changes the run); now when omitted. */
  now?: Date;
}

export interface ImportRunResult {
  runId: string;
  /** Dataset-relative path the run file is (or would be) written to. */
  path: string;
  /** True when the run goes to quarantine/. */
  flagged: boolean;
  flags: PlausibilityFlag[];
  /** The run file bytes. */
  fileText: string;
  /** The index entry appended to `index/summary.json`. */
  entry: RunIndexEntry;
  /** Entries in the index before the import. */
  indexEntriesBefore: number;
  /** True when the publication scrub rewrote more than the nonce (`scrubbedAt` stamped, digest recomputed). */
  scrubbed: boolean;
  dryRun: boolean;
}

function describeRejection(rejection: SubmissionRejection): string {
  const { code, message, errors } = rejection.body;
  const detail = errors && errors.length > 0 ? errors.slice(0, 5).join('; ') : (message ?? '');
  return `the submit route would refuse this file (${rejection.status} ${code}): ${detail}`;
}

/** Every dataset path named `<file>` under runs/ and quarantine/. */
function findByFileName(datasetDir: string, fileName: string): string[] {
  const hits: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile() && ent.name === fileName) hits.push(relative(datasetDir, p).split(sep).join('/'));
    }
  };
  walk(join(datasetDir, 'runs'));
  walk(join(datasetDir, 'quarantine'));
  return hits;
}

function readIndex(datasetDir: string): RunIndexEntry[] {
  const path = join(datasetDir, INDEX_FILE);
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new ImportRunError(`${INDEX_FILE} is not a JSON array`);
  if (serializeIndexEntries(parsed as RunIndexEntry[]) !== raw) {
    throw new ImportRunError(`${INDEX_FILE} is not in the compact layout the submit route writes; nothing written`);
  }
  return parsed as RunIndexEntry[];
}

/**
 * Import an exported run file into a dataset clone.
 *
 * @param options - Dataset clone, exported file, `dryRun`, and the import time.
 * @returns What was (or would be) written.
 * @throws {ImportRunError} When the route's pipeline refuses the file, or the
 *   run id is already in the dataset.
 */
export async function importExportedRun(options: ImportRunOptions): Promise<ImportRunResult> {
  const { datasetDir, file, dryRun = false } = options;
  const now = options.now ?? new Date();
  if (!existsSync(join(datasetDir, 'runs'))) {
    throw new ImportRunError(`${datasetDir} has no runs/ directory; pass --dataset <clone>`);
  }

  const parsed = parseSubmissionBody(readFileSync(file, 'utf8'));
  if ('rejection' in parsed) throw new ImportRunError(describeRejection(parsed.rejection));
  const { run } = parsed;
  const checking = await checkSubmission(run);
  if ('rejection' in checking) throw new ImportRunError(describeRejection(checking.rejection));
  const { checked } = checking;

  const published = await toPublishedRun(run, () => now);
  const publication = publicationOf(published, checked);
  const entry: RunIndexEntry = { ...publication.entry, importedAt: now.toISOString() };

  // The route's duplicate protection is GitHub refusing to create an
  // existing file; here every place the run could already be is checked.
  const index = readIndex(datasetDir);
  const fileName = publication.path.slice(publication.path.lastIndexOf('/') + 1);
  const existing = findByFileName(datasetDir, fileName);
  if (existing.length > 0) throw new ImportRunError(`run ${run.runId} is already in the dataset: ${existing.join(', ')}`);
  const nextIndex = appendIndexEntry(index, entry);
  if (nextIndex === null) throw new ImportRunError(`run ${run.runId} is already in ${INDEX_FILE}`);

  if (!dryRun) {
    const target = join(datasetDir, publication.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, publication.fileText, { flag: 'wx' });
    writeFileSync(join(datasetDir, INDEX_FILE), serializeIndexEntries(nextIndex));
  }

  return {
    runId: run.runId,
    path: publication.path,
    flagged: checked.flagged,
    flags: checked.flags,
    fileText: publication.fileText,
    entry,
    indexEntriesBefore: index.length,
    scrubbed: published.scrubbedAt !== undefined && published.scrubbedAt !== run.scrubbedAt,
    dryRun,
  };
}

/** The printed summary. */
export function formatImportResult(r: ImportRunResult): string {
  const { cells, ...rest } = r.entry;
  const lines = [
    `run: ${r.runId}`,
    `run file: ${r.path} (${r.flagged ? 'quarantine: flagged, hidden from the leaderboard' : 'runs: verified'}, ${Buffer.byteLength(r.fileText)} bytes)`,
    `flags: ${r.flags.length === 0 ? 'none' : ''}`,
    ...r.flags.map((f) => `  - ${JSON.stringify(f)}`),
    `publication scrub: ${r.scrubbed ? 'rewrote fields, scrubbedAt stamped, digest recomputed' : 'nonce removed only, client digest kept'}`,
    `index entry appended to ${INDEX_FILE} (entries ${r.indexEntriesBefore} -> ${r.indexEntriesBefore + 1}):`,
    JSON.stringify(rest, null, 2),
    `  cells: ${cells.length} ok cells (${cells.map((c) => c.cellId).join(', ')})`,
    r.dryRun ? 'dry run: nothing written' : 'written',
  ];
  return lines.join('\n');
}

async function main(argv: string[]): Promise<number> {
  const arg = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const datasetArg = arg('--dataset');
  const file = arg('--file');
  if (!datasetArg || !file) {
    console.error('usage: tsx scripts/import-exported-run.ts --dataset <clone> --file <export.json> [--dry-run]');
    return 1;
  }
  try {
    const result = await importExportedRun({
      datasetDir: resolve(datasetArg),
      file: resolve(file),
      dryRun: argv.includes('--dry-run'),
    });
    console.log(formatImportResult(result));
    return 0;
  } catch (error) {
    console.error(`[import-exported-run] ${(error as Error).message}`);
    return 1;
  }
}

function isDirectRun(): boolean {
  const invoked = process.argv[1];
  if (!invoked) return false;
  try {
    return realpathSync(invoked) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  void main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
