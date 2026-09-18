/**
 * Paper analysis CLI: aggregate a directory of raw run JSONs (a clone of the
 * results dataset repo, or locally exported runs) into paper-ready CSVs.
 *
 * Usage:
 *   npx tsx packages/bench/scripts/analyze.ts <runs-dir> [out-dir]
 *
 * Emits into out-dir (default: <runs-dir>/../analysis):
 *   leaderboard.csv  — aggregated rows (median-of-medians, min-N flags)
 *   iterations.csv   — long format, one row per timed iteration (R/pandas-ready)
 *   validation.txt   — per-run validation report (shape + plausibility)
 */

import { readdirSync, readFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  aggregateRuns,
  rowsToCSV,
  runsToLongCSV,
  validateSubmission,
  type BenchRunResult,
} from '../src/index.js';

function collectJsonFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collectJsonFiles(full));
    else if (name.endsWith('.json') && !name.startsWith('summary')) out.push(full);
  }
  return out;
}

function main(): void {
  const [, , runsDirArg, outDirArg] = process.argv;
  if (!runsDirArg) {
    console.error('usage: analyze.ts <runs-dir> [out-dir]');
    process.exit(2);
  }
  const runsDir = resolve(runsDirArg);
  const outDir = resolve(outDirArg ?? join(runsDir, '..', 'analysis'));
  mkdirSync(outDir, { recursive: true });

  const files = collectJsonFiles(runsDir);
  const runs: BenchRunResult[] = [];
  const reportLines: string[] = [];
  for (const file of files) {
    try {
      const run = JSON.parse(readFileSync(file, 'utf8')) as BenchRunResult;
      const report = validateSubmission(run);
      reportLines.push(
        `${file}: shape=${report.shapeErrors.length === 0 ? 'ok' : 'ERRORS'} ` +
          `flags=[${report.flags.map((f) => `${f.severity}:${f.code}`).join(', ')}]`,
      );
      if (report.shapeErrors.length === 0) runs.push(run);
    } catch (error) {
      reportLines.push(`${file}: UNPARSEABLE (${(error as Error).message})`);
    }
  }

  writeFileSync(join(outDir, 'leaderboard.csv'), rowsToCSV(aggregateRuns(runs)));
  writeFileSync(join(outDir, 'iterations.csv'), runsToLongCSV(runs));
  writeFileSync(join(outDir, 'validation.txt'), reportLines.join('\n') + '\n');
  console.log(`analyzed ${runs.length}/${files.length} runs -> ${outDir}`);
}

main();
