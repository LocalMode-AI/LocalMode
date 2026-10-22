/**
 * Rebuild `index/summary.json` of a LocalMode Bench dataset clone from its run
 * files. Every `runs/**.json` (verified) and `quarantine/**.json` (flagged)
 * file becomes one index entry, built by the same `toIndexEntry()` the submit
 * route uses, over the same server-side summaries (`validateSubmission`, with
 * `anyProtocol` so archived protocol versions keep their metrics), so a rebuilt
 * entry is identical to the one the submit path wrote for that run.
 *
 * Entries are ordered by `createdAt`, then by path, so the output depends only
 * on the run files. The output is compact JSON with no trailing newline, as the
 * submit path writes it. The entry fields no run file holds, `importedAt` and
 * `importNote` (set by `import-exported-run.ts` on a run added from an
 * exported file), are carried over from the current index for the same run id.
 *
 * The tool refuses to write an index that has fewer entries than the current
 * one, or that drops a run the current index lists, unless `--allow-shrink`
 * is passed (for example after deleting a run file on purpose).
 *
 * When the dataset has `index/errata.json` (published cells excluded from
 * every aggregate, each with a reason), the tool checks it against the run
 * files and refuses to write when an entry is malformed or names a run or a
 * cell the dataset does not hold, or a cell that is not `ok`. The index
 * itself is unchanged by errata: listed cells keep their entries, and the
 * leaderboard leaves them out and counts them.
 *
 * Usage (from apps/ui):
 *   pnpm exec tsx scripts/rebuild-bench-index.ts --dataset ../../../LocalMode-Bench
 *   pnpm exec tsx scripts/rebuild-bench-index.ts --dataset <dir> --dry-run
 *   pnpm exec tsx scripts/rebuild-bench-index.ts --dataset <dir> --allow-shrink
 */

import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ERRATA_FILE, validateErrata, validateSubmission, type BenchRunResult, type ErrataRunRef } from '@localmode/bench';
import { assertIndexNotShrinking, toIndexEntry, type RunIndexEntry } from '../src/lib/bench/store';

/** Dataset-relative path of the index. */
export const INDEX_FILE = 'index/summary.json';

/** A run file the rebuild could not turn into an index entry. */
export interface RebuildProblem {
  path: string;
  reason: string;
}

/** The dataset's errata file, checked against its run files. */
export interface RebuildErrata {
  /** Dataset-relative path, or null when the dataset has no errata file. */
  path: string | null;
  /** Entries in the file. */
  entries: number;
  /** Cells the file lists. */
  cells: number;
  /** Why the file cannot be applied; empty when it can. */
  errors: string[];
}

export interface RebuildResult {
  entries: RunIndexEntry[];
  problems: RebuildProblem[];
  errata: RebuildErrata;
}

function listJson(root: string, dir: string): string[] {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const ent of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile() && ent.name.endsWith('.json')) out.push(relative(root, p).split(sep).join('/'));
    }
  };
  walk(abs);
  return out;
}

/**
 * Build the index entries for every run file in a dataset clone.
 *
 * @param datasetDir - Root of the dataset clone (holds `runs/` and `quarantine/`).
 * @param current - The index being replaced; its `importedAt` and `importNote` values are kept.
 * @returns The ordered entries and any run file that could not be indexed.
 */
export function buildIndexFromDataset(datasetDir: string, current: readonly RunIndexEntry[] = []): RebuildResult {
  const imports = new Map<string, Pick<RunIndexEntry, 'importedAt' | 'importNote'>>();
  for (const e of current) {
    if (typeof e.importedAt !== 'string') continue;
    imports.set(e.runId, { importedAt: e.importedAt, ...(typeof e.importNote === 'string' ? { importNote: e.importNote } : {}) });
  }
  const entries: RunIndexEntry[] = [];
  const problems: RebuildProblem[] = [];
  const seen = new Map<string, string>();
  const refs: ErrataRunRef[] = [];
  for (const path of [...listJson(datasetDir, 'runs'), ...listJson(datasetDir, 'quarantine')]) {
    let run: BenchRunResult;
    try {
      run = JSON.parse(readFileSync(join(datasetDir, path), 'utf8')) as BenchRunResult;
    } catch (error) {
      problems.push({ path, reason: `not valid JSON: ${(error as Error).message}` });
      continue;
    }
    const report = validateSubmission(run, { anyProtocol: true });
    if (report.shapeErrors.length > 0) {
      problems.push({ path, reason: `shape errors: ${report.shapeErrors.slice(0, 3).join('; ')}` });
      continue;
    }
    const earlier = seen.get(run.runId);
    if (earlier) {
      problems.push({ path, reason: `runId ${run.runId} also in ${earlier}` });
      continue;
    }
    seen.set(run.runId, path);
    refs.push({ runId: run.runId, cells: run.cells.map((c) => ({ cellId: c.cellId, status: c.status })) });
    // The directory is the publication decision: quarantine/ holds the runs
    // the submit path flagged, runs/ the verified ones.
    const entry = toIndexEntry(run, report.summaries, path.startsWith('quarantine/'), path);
    const imported = imports.get(run.runId);
    // Appended last, where the import tool puts them.
    entries.push(imported === undefined ? entry : { ...entry, ...imported });
  }
  entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.path.localeCompare(b.path));
  return { entries, problems, errata: checkDatasetErrata(datasetDir, refs) };
}

/**
 * Check the dataset's `index/errata.json`, when present, against its runs.
 *
 * @param datasetDir - Root of the dataset clone.
 * @param runs - Every run file of the dataset (`runs/` and `quarantine/`).
 */
export function checkDatasetErrata(datasetDir: string, runs: readonly ErrataRunRef[]): RebuildErrata {
  const abs = join(datasetDir, ERRATA_FILE);
  if (!existsSync(abs)) return { path: null, entries: 0, cells: 0, errors: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(abs, 'utf8'));
  } catch (error) {
    return { path: ERRATA_FILE, entries: 0, cells: 0, errors: [`not valid JSON: ${(error as Error).message}`] };
  }
  const errors = validateErrata(parsed, runs);
  const list = Array.isArray(parsed) ? (parsed as Array<{ cellIds?: unknown }>) : [];
  const cells = list.reduce((n, e) => n + (Array.isArray(e?.cellIds) ? e.cellIds.length : 0), 0);
  return { path: ERRATA_FILE, entries: list.length, cells, errors };
}

/** Serialize entries exactly as the submit path writes the index. */
export function serializeIndex(entries: readonly RunIndexEntry[]): string {
  return JSON.stringify(entries);
}

/**
 * Check a rebuilt index against the current one: it must not hold fewer
 * entries, and every run the current index lists must still be present.
 *
 * @throws {BenchStoreError} `index-shrink` when entries would be dropped and
 *   `allowShrink` is not set.
 */
export function checkRebuildAgainst(
  current: readonly RunIndexEntry[],
  rebuilt: readonly RunIndexEntry[],
  allowShrink = false,
): void {
  assertIndexNotShrinking(current.length, rebuilt.length, { rebuild: allowShrink });
  if (allowShrink) return;
  const ids = new Set(rebuilt.map((e) => e.runId));
  const dropped = current.filter((e) => !ids.has(e.runId)).map((e) => e.runId);
  if (dropped.length > 0) {
    // Same refusal as a shrinking write: these entries would disappear.
    assertIndexNotShrinking(current.length, current.length - dropped.length);
  }
}

function readCurrentIndex(path: string): RunIndexEntry[] {
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`${path} is not a JSON array`);
  return parsed as RunIndexEntry[];
}

function main(argv: string[]): number {
  const arg = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const datasetDir = resolve(arg('--dataset') ?? process.cwd());
  const dryRun = argv.includes('--dry-run');
  const allowShrink = argv.includes('--allow-shrink');
  const indexPath = join(datasetDir, INDEX_FILE);
  if (!existsSync(join(datasetDir, 'runs'))) {
    console.error(`[rebuild-bench-index] ${datasetDir} has no runs/ directory; pass --dataset <clone>`);
    return 1;
  }

  const current = readCurrentIndex(indexPath);
  const { entries, problems, errata } = buildIndexFromDataset(datasetDir, current);
  if (problems.length > 0) {
    for (const p of problems) console.error(`[rebuild-bench-index] cannot index ${p.path}: ${p.reason}`);
    console.error('[rebuild-bench-index] nothing written; fix or remove these files first');
    return 1;
  }
  if (errata.errors.length > 0) {
    for (const e of errata.errors) console.error(`[rebuild-bench-index] ${errata.path}: ${e}`);
    console.error(`[rebuild-bench-index] nothing written; fix ${errata.path} first`);
    return 1;
  }
  if (errata.path) {
    console.log(
      `[rebuild-bench-index] ${errata.path}: ${errata.entries} entries, ${errata.cells} cells excluded by erratum from the leaderboard`,
    );
  }
  try {
    checkRebuildAgainst(current, entries, allowShrink);
  } catch (error) {
    console.error(`[rebuild-bench-index] ${(error as Error).message}; pass --allow-shrink if that is intended`);
    return 1;
  }
  const flagged = entries.filter((e) => e.flagged).length;
  console.log(
    `[rebuild-bench-index] ${entries.length} entries (${entries.length - flagged} verified, ${flagged} flagged); current index has ${current.length}`,
  );
  if (dryRun) {
    console.log('[rebuild-bench-index] dry run: nothing written');
    return 0;
  }
  writeFileSync(indexPath, serializeIndex(entries));
  console.log(`[rebuild-bench-index] wrote ${indexPath}`);
  return 0;
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
  process.exitCode = main(process.argv.slice(2));
}
