/**
 * File exported control runs (`harness.control`, a control experiment for
 * the methodology run from `/bench/run?control=<kind>`) into a LocalMode
 * Bench dataset clone, beside the protocol runs but never indexed:
 *
 *   controls/<kind>/<YYYY-MM-DD>/<runId>.json
 *
 * where the date is the run's `createdAt` in UTC. Each file is checked the
 * way the submit route checks a run, minus the parts that only apply to a
 * published run: the 4 MB cap and JSON parsing, the control marker (a
 * protocol run is refused here; import it with `import-exported-run.ts`),
 * the page's digest, and the full shape and plausibility validation
 * (`validateSubmission`; plausibility flags are printed and kept, since a
 * control run is never scored). The publication scrub then drops the nonce
 * if the file has one. `index/summary.json` is never read or written, so a
 * control run can never reach the leaderboard. A run id already present
 * under runs/, quarantine/ or controls/ is refused, and so is the whole
 * batch when any file is refused: nothing is written unless every file
 * passes.
 *
 * Usage (from apps/ui):
 *   pnpm exec tsx scripts/collect-control-runs.ts --dataset ../../../LocalMode-Bench --dir ~/Downloads/control-runs --dry-run
 *   pnpm exec tsx scripts/collect-control-runs.ts --dataset ../../../LocalMode-Bench --dir ~/Downloads/control-runs
 *   pnpm exec tsx scripts/collect-control-runs.ts --dataset ../../../LocalMode-Bench --file a.json --file b.json
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isControlRun, validateSubmission, verifyRunDigest, type BenchRunResult, type PlausibilityFlag } from '@localmode/bench';
import { parseSubmissionBody, serializeRunFile, toPublishedRun } from '../src/lib/bench/submission';

/** Dataset-relative folder control runs are filed under. */
export const CONTROLS_DIR = 'controls';

export class CollectControlRunsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CollectControlRunsError';
  }
}

export interface CollectControlRunsOptions {
  datasetDir: string;
  /** Exported control-run files. */
  files: string[];
  dryRun?: boolean;
  /** Time stamped as `scrubbedAt` if the publication scrub rewrites a run; now when omitted. */
  now?: Date;
}

export interface CollectedControlRun {
  file: string;
  runId: string;
  kind: string;
  /** Dataset-relative path the run is (or would be) written to. */
  path: string;
  /** Plausibility flags `validateSubmission` reported (kept, never a reason to refuse). */
  flags: PlausibilityFlag[];
  /** The bytes written. */
  fileText: string;
}

export interface CollectControlRunsResult {
  collected: CollectedControlRun[];
  dryRun: boolean;
}

/**
 * The dataset path of a control run: `controls/<kind>/<YYYY-MM-DD>/<runId>.json`.
 *
 * @param run - A run carrying `harness.control`.
 * @returns The dataset-relative path.
 */
export function controlRunPath(run: BenchRunResult): string {
  const kind = String(run.harness.control?.kind ?? '').replace(/[^\w-]/g, '');
  const date = new Date(run.createdAt).toISOString().slice(0, 10);
  const safeId = run.runId.replace(/[^\w-]/g, '').slice(0, 64);
  return `${CONTROLS_DIR}/${kind}/${date}/${safeId}.json`;
}

/** Every dataset path named `<fileName>` under runs/, quarantine/ and controls/. */
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
  for (const top of ['runs', 'quarantine', CONTROLS_DIR]) walk(join(datasetDir, top));
  return hits;
}

/** Check one exported file; returns the collected record or throws with the reason. */
async function checkOne(file: string, now: Date): Promise<CollectedControlRun> {
  const parsed = parseSubmissionBody(readFileSync(file, 'utf8'));
  if ('rejection' in parsed) {
    throw new CollectControlRunsError(`${file}: ${parsed.rejection.body.message ?? parsed.rejection.body.code}`);
  }
  const { run } = parsed;
  if (!isControlRun(run)) {
    throw new CollectControlRunsError(
      `${file}: not a control run (no harness.control); import a protocol run with scripts/import-exported-run.ts`,
    );
  }
  if (!(await verifyRunDigest(run))) {
    throw new CollectControlRunsError(`${file}: the digest is missing or wrong; the file is not what the page exported`);
  }
  const report = validateSubmission(run);
  if (report.shapeErrors.length > 0) {
    throw new CollectControlRunsError(`${file}: invalid shape: ${report.shapeErrors.slice(0, 5).join('; ')}`);
  }
  const published = await toPublishedRun(run, () => now);
  return {
    file,
    runId: run.runId,
    kind: String(run.harness.control?.kind),
    path: controlRunPath(published),
    flags: report.flags,
    fileText: serializeRunFile(published),
  };
}

/**
 * Collect exported control runs into a dataset clone, without indexing them.
 *
 * @param options - Dataset clone, exported files, `dryRun`, and the collection time.
 * @returns What was (or would be) written.
 * @throws {CollectControlRunsError} When any file is refused (nothing is written then).
 */
export async function collectControlRuns(options: CollectControlRunsOptions): Promise<CollectControlRunsResult> {
  const { datasetDir, files, dryRun = false } = options;
  const now = options.now ?? new Date();
  if (!existsSync(join(datasetDir, 'runs'))) {
    throw new CollectControlRunsError(`${datasetDir} has no runs/ directory; pass --dataset <clone>`);
  }
  if (files.length === 0) throw new CollectControlRunsError('no files to collect');

  const collected: CollectedControlRun[] = [];
  const seen = new Map<string, string>();
  for (const file of files) {
    const one = await checkOne(file, now);
    const fileName = one.path.slice(one.path.lastIndexOf('/') + 1);
    const existing = findByFileName(datasetDir, fileName);
    if (existing.length > 0) {
      throw new CollectControlRunsError(`${file}: run ${one.runId} is already in the dataset: ${existing.join(', ')}`);
    }
    const twin = seen.get(fileName);
    if (twin) throw new CollectControlRunsError(`${file}: run ${one.runId} is also in ${twin}`);
    seen.set(fileName, file);
    collected.push(one);
  }

  if (!dryRun) {
    for (const one of collected) {
      const target = join(datasetDir, one.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, one.fileText, { flag: 'wx' });
    }
  }
  return { collected, dryRun };
}

/** The `.json` files directly inside a folder, in sorted order. */
export function jsonFilesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => join(dir, e.name))
    .sort();
}

/** The printed summary. */
export function formatCollectResult(r: CollectControlRunsResult): string {
  const lines = r.collected.map(
    (c) =>
      `${c.path} <- ${c.file} (${c.kind}, ${Buffer.byteLength(c.fileText)} bytes; flags: ${
        c.flags.length === 0 ? 'none' : c.flags.map((f) => `${f.severity}:${f.code}`).join(', ')
      })`,
  );
  lines.push(`${r.collected.length} control run${r.collected.length === 1 ? '' : 's'}; index/summary.json untouched`);
  lines.push(r.dryRun ? 'dry run: nothing written' : 'written');
  return lines.join('\n');
}

async function main(argv: string[]): Promise<number> {
  const values = (name: string) => argv.flatMap((a, i) => (a === name && argv[i + 1] !== undefined ? [argv[i + 1]] : []));
  const [datasetArg] = values('--dataset');
  const files = [...values('--file').map((f) => resolve(f)), ...values('--dir').flatMap((d) => jsonFilesIn(resolve(d)))];
  if (!datasetArg || files.length === 0) {
    console.error(
      'usage: tsx scripts/collect-control-runs.ts --dataset <clone> (--file <export.json> ... | --dir <folder>) [--dry-run]',
    );
    return 1;
  }
  try {
    const result = await collectControlRuns({ datasetDir: resolve(datasetArg), files, dryRun: argv.includes('--dry-run') });
    console.log(formatCollectResult(result));
    return 0;
  } catch (error) {
    console.error(`[collect-control-runs] ${(error as Error).message}`);
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
