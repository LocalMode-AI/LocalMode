/**
 * Analysis CLI: aggregate a directory of raw run JSONs (a clone of the
 * results dataset repo, or locally exported runs) into analysis-ready CSVs.
 *
 * Usage:
 *   npx tsx packages/bench/scripts/analyze.ts <runs-dir> [out-dir] [--errata <file> | --no-errata]
 *
 * Emits into out-dir (default: <runs-dir>/../analysis):
 *   leaderboard.csv  - aggregated rows (median-of-medians, min-N flags, excludedByErratum per row)
 *   iterations.csv   - long format, one row per timed iteration (R/pandas-ready)
 *   cells.csv        - one row per cell: warmup, load record, runtime config, memory, quality, error, wall-clock span
 *   runs.csv         - one row per run: harness, environment, cell counts, validation, series, pressure, runtime versions, battery
 *   validation.txt   - per-run validation report (shape + plausibility)
 *   errata.txt       - the errata file applied, the excluded-by-erratum tally, and every excluded cell
 *
 * Errata: the dataset's `index/errata.json` lists published cells that enter
 * no aggregate, each with a reason (an exclusion, never a re-score). The CLI
 * reads it from `--errata <file>`, else from `<runs-dir>/index/errata.json`,
 * else from `<runs-dir>/../index/errata.json`; `--no-errata` applies none.
 * An errata file that is malformed, or names a run or a cell not among the
 * runs read, stops the CLI before anything is written. Only leaderboard.csv
 * is affected; the per-run, per-cell and per-iteration exports keep every cell.
 *
 * Run files are read in sorted path order (the dataset's `index/` directory
 * is never read as runs), so every output is deterministic.
 * The columns of each CSV are documented in packages/bench/README.md (Analysis tooling).
 */

import { existsSync, readdirSync, readFileSync, realpathSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ERRATA_FILE,
  aggregateRunsWithErrata,
  errataExclusions,
  rowsToCSV,
  runsToCellsCSV,
  runsToLongCSV,
  runsToRunsCSV,
  validateErrata,
  validateSubmission,
  type BenchRunResult,
  type ErrataTally,
  type ErratumEntry,
} from '../src/index.js';

function collectJsonFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const st = statSync(full);
    // index/ holds the dataset's summary and errata, not runs.
    if (st.isDirectory()) {
      if (name !== 'index') out.push(...collectJsonFiles(full));
    } else if (name.endsWith('.json') && !name.startsWith('summary')) out.push(full);
  }
  return out;
}

/** Options of {@link analyzeDataset}. */
export interface AnalyzeOptions {
  /** Errata file to apply; `null` applies none; undefined looks next to the runs. */
  errataPath?: string | null;
}

/** What {@link analyzeDataset} read and wrote. */
export interface AnalyzeSummary {
  files: number;
  runs: number;
  outDir: string;
  /** The errata file applied, or null. */
  errataPath: string | null;
  /** Entries in that file. */
  errataEntries: number;
  excludedByErratum: ErrataTally;
}

/** The errata file the CLI applies when none is named. */
export function findErrataFile(runsDir: string): string | null {
  for (const candidate of [join(runsDir, ERRATA_FILE), join(runsDir, '..', ERRATA_FILE)]) {
    if (existsSync(candidate)) return resolve(candidate);
  }
  return null;
}

/**
 * Analyze every run file under `runsDir` into `outDir`.
 *
 * @throws {Error} when the errata file cannot be parsed or does not validate
 *   against the runs read (nothing is written then).
 */
export function analyzeDataset(runsDirArg: string, outDirArg?: string, options: AnalyzeOptions = {}): AnalyzeSummary {
  const runsDir = resolve(runsDirArg);
  const outDir = resolve(outDirArg ?? join(runsDir, '..', 'analysis'));

  const files = collectJsonFiles(runsDir);
  const runs: BenchRunResult[] = [];
  const reportLines: string[] = [];
  for (const file of files) {
    try {
      const run = JSON.parse(readFileSync(file, 'utf8')) as BenchRunResult;
      // Every archived protocol version is analysed; rows carry `protocol`
      // and never mix, so the reader partitions by it.
      const report = validateSubmission(run, { anyProtocol: true });
      reportLines.push(
        `${file}: shape=${report.shapeErrors.length === 0 ? 'ok' : 'ERRORS'} ` +
          `flags=[${report.flags.map((f) => `${f.severity}:${f.code}`).join(', ')}]`,
      );
      if (report.shapeErrors.length === 0) runs.push(run);
    } catch (error) {
      reportLines.push(`${file}: UNPARSEABLE (${(error as Error).message})`);
    }
  }

  const errataPath = options.errataPath === undefined ? findErrataFile(runsDir) : options.errataPath;
  let errata: ErratumEntry[] = [];
  if (errataPath !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(errataPath, 'utf8'));
    } catch (error) {
      throw new Error(`errata file ${errataPath} is not valid JSON: ${(error as Error).message}`);
    }
    const errors = validateErrata(parsed, runs);
    if (errors.length > 0) {
      throw new Error(`errata file ${errataPath} does not apply to the runs read:\n  ${errors.join('\n  ')}`);
    }
    errata = parsed as ErratumEntry[];
  }

  const { rows, excludedByErratum } = aggregateRunsWithErrata(runs, { errata });
  const excluded = errataExclusions(errata);
  const reasons = new Map(errata.flatMap((e) => e.cellIds.map((c) => [`${e.runId} ${c}`, e.reason] as const)));
  const errataLines = [
    `errata: ${errataPath ?? 'none'} (${errata.length} entr${errata.length === 1 ? 'y' : 'ies'})`,
    `excluded by erratum: ${excludedByErratum.cells} cell${excludedByErratum.cells === 1 ? '' : 's'} ` +
      `from ${excludedByErratum.runs} run${excludedByErratum.runs === 1 ? '' : 's'}`,
  ];
  for (const run of runs) {
    for (const cell of run.cells) {
      if (excluded.has(run.runId, cell.cellId)) {
        errataLines.push(`  ${run.runId} ${cell.cellId}: ${reasons.get(`${run.runId} ${cell.cellId}`)}`);
      }
    }
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'leaderboard.csv'), rowsToCSV(rows));
  writeFileSync(join(outDir, 'iterations.csv'), runsToLongCSV(runs));
  writeFileSync(join(outDir, 'cells.csv'), runsToCellsCSV(runs));
  writeFileSync(join(outDir, 'runs.csv'), runsToRunsCSV(runs, { anyProtocol: true }));
  writeFileSync(join(outDir, 'validation.txt'), reportLines.join('\n') + '\n');
  writeFileSync(join(outDir, 'errata.txt'), errataLines.join('\n') + '\n');
  return {
    files: files.length,
    runs: runs.length,
    outDir,
    errataPath,
    errataEntries: errata.length,
    excludedByErratum,
  };
}

function main(argv: string[]): number {
  const positional: string[] = [];
  let errataPath: string | null | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--errata') errataPath = resolve(argv[++i] ?? '');
    else if (argv[i] === '--no-errata') errataPath = null;
    else positional.push(argv[i]);
  }
  const [runsDirArg, outDirArg] = positional;
  if (!runsDirArg) {
    console.error('usage: analyze.ts <runs-dir> [out-dir] [--errata <file> | --no-errata]');
    return 2;
  }
  try {
    const s = analyzeDataset(runsDirArg, outDirArg, { errataPath });
    console.log(`analyzed ${s.runs}/${s.files} runs -> ${s.outDir}`);
    console.log(
      `errata: ${s.errataPath ?? 'none'}; excluded by erratum: ${s.excludedByErratum.cells} cells ` +
        `from ${s.excludedByErratum.runs} runs`,
    );
    return 0;
  } catch (error) {
    console.error(`[analyze] ${(error as Error).message}`);
    console.error('[analyze] nothing written');
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
  process.exitCode = main(process.argv.slice(2));
}
