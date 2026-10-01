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
 * submit path writes it.
 *
 * The tool refuses to write an index that has fewer entries than the current
 * one, or that drops a run the current index lists, unless `--allow-shrink`
 * is passed (for example after deleting a run file on purpose).
 *
 * Usage (from apps/ui):
 *   pnpm exec tsx scripts/rebuild-bench-index.ts --dataset ../../LocalMode-Bench
 *   pnpm exec tsx scripts/rebuild-bench-index.ts --dataset <dir> --dry-run
 *   pnpm exec tsx scripts/rebuild-bench-index.ts --dataset <dir> --allow-shrink
 */

import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSubmission, type BenchRunResult } from '@localmode/bench';
import { assertIndexNotShrinking, toIndexEntry, type RunIndexEntry } from '../src/lib/bench/store';

/** Dataset-relative path of the index. */
export const INDEX_FILE = 'index/summary.json';

/** A run file the rebuild could not turn into an index entry. */
export interface RebuildProblem {
  path: string;
  reason: string;
}

export interface RebuildResult {
  entries: RunIndexEntry[];
  problems: RebuildProblem[];
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
 * @returns The ordered entries and any run file that could not be indexed.
 */
export function buildIndexFromDataset(datasetDir: string): RebuildResult {
  const entries: RunIndexEntry[] = [];
  const problems: RebuildProblem[] = [];
  const seen = new Map<string, string>();
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
    // The directory is the publication decision: quarantine/ holds the runs
    // the submit path flagged, runs/ the verified ones.
    entries.push(toIndexEntry(run, report.summaries, path.startsWith('quarantine/'), path));
  }
  entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.path.localeCompare(b.path));
  return { entries, problems };
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

  const { entries, problems } = buildIndexFromDataset(datasetDir);
  if (problems.length > 0) {
    for (const p of problems) console.error(`[rebuild-bench-index] cannot index ${p.path}: ${p.reason}`);
    console.error('[rebuild-bench-index] nothing written; fix or remove these files first');
    return 1;
  }
  const current = readCurrentIndex(indexPath);
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
