/**
 * The analysis CLI over a dataset fixture laid out as the dataset repository
 * is (`runs/YYYY/MM/<runId>.json`, `index/summary.json`, `index/errata.json`).
 * Each case runs the real script in a child process (`tsx scripts/analyze.ts`)
 * and reads the files it wrote.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ErratumEntry } from '../src/index.js';
import { MMLU_CELL_ID, errataRuns } from './fixtures/errata-runs.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, '../scripts/analyze.ts');
const TSX = resolve(HERE, '../../../node_modules/.bin/tsx');

const ERRATUM: ErratumEntry = {
  runId: 'errata-run-replaced',
  cellIds: [MMLU_CELL_ID],
  reason: 'loaded the replaced model file: score 0 at parse rate 0 is the empty prompt, not a fidelity reading',
  recordedAt: '2026-10-22',
  reference: 'README.md, Erratum, LiteRT Qwen3 model file',
};

let dataset: string;

function writeDataset(errata?: unknown): void {
  for (const run of errataRuns()) {
    const path = join(dataset, 'runs/2026/10', `${run.runId}.json`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(run));
  }
  mkdirSync(join(dataset, 'index'), { recursive: true });
  writeFileSync(join(dataset, 'index/summary.json'), '[]');
  if (errata !== undefined) writeFileSync(join(dataset, 'index/errata.json'), JSON.stringify(errata));
}

function analyze(...args: string[]) {
  const res = spawnSync(TSX, [SCRIPT, ...args], { encoding: 'utf8', timeout: 60_000 });
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

function mmluLine(outDir: string): string[] {
  const csv = readFileSync(join(outDir, 'leaderboard.csv'), 'utf8').trimEnd().split('\n');
  const header = csv[0].split(',');
  const line = csv.find((l) => l.includes(',quality-mmlu-25,'));
  expect(line).toBeDefined();
  // No field of this row is quoted, so a plain split is exact.
  const fields = line!.split(',');
  return ['submissions', 'qualityScore', 'qualityParseRate', 'excludedByErratum'].map((c) => fields[header.indexOf(c)]);
}

beforeEach(() => {
  dataset = mkdtempSync(join(tmpdir(), 'bench-analyze-'));
});

afterEach(() => {
  rmSync(dataset, { recursive: true, force: true });
});

describe('analyze.ts over a dataset fixture', () => {
  it('applies index/errata.json from the dataset root: the row median and n change and the tally is written', () => {
    writeDataset([ERRATUM]);
    const out = join(dataset, 'out');
    const res = analyze(dataset, out);
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('analyzed 3/3 runs');
    expect(res.stdout).toContain('excluded by erratum: 1 cells from 1 runs');
    expect(mmluLine(out)).toEqual(['2', '0.44', '0.98', '1']);
    const errataTxt = readFileSync(join(out, 'errata.txt'), 'utf8');
    expect(errataTxt).toContain(`errata: ${join(dataset, 'index/errata.json')} (1 entry)`);
    expect(errataTxt).toContain('excluded by erratum: 1 cell from 1 run');
    expect(errataTxt).toContain(`errata-run-replaced ${MMLU_CELL_ID}: ${ERRATUM.reason}`);
    // The per-cell export keeps the excluded cell: an exclusion is not a deletion.
    const cells = readFileSync(join(out, 'cells.csv'), 'utf8');
    expect(cells).toContain(`errata-run-replaced,localmode-bench/5,${MMLU_CELL_ID},`);
  });

  it('finds the errata file next to runs/ when given the runs directory', () => {
    writeDataset([ERRATUM]);
    const out = join(dataset, 'out');
    expect(analyze(join(dataset, 'runs'), out).code).toBe(0);
    expect(mmluLine(out)).toEqual(['2', '0.44', '0.98', '1']);
  });

  it('without an errata file (or with --no-errata) nothing is excluded', () => {
    writeDataset();
    const out = join(dataset, 'out');
    const res = analyze(dataset, out);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('errata: none; excluded by erratum: 0 cells from 0 runs');
    expect(mmluLine(out)).toEqual(['3', '0.4', '0.96', '0']);

    writeFileSync(join(dataset, 'index/errata.json'), JSON.stringify([ERRATUM]));
    const out2 = join(dataset, 'out2');
    expect(analyze(dataset, out2, '--no-errata').code).toBe(0);
    expect(mmluLine(out2)).toEqual(['3', '0.4', '0.96', '0']);
  });

  it('refuses an erratum that names a run not in the dataset, and writes nothing', () => {
    writeDataset([{ ...ERRATUM, runId: 'not-in-dataset-0000' }]);
    const out = join(dataset, 'out');
    const res = analyze(dataset, out);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('errata[0]: run not-in-dataset-0000 is not in the dataset');
    expect(res.stderr).toContain('nothing written');
    expect(existsSync(out)).toBe(false);
  });

  it('refuses a malformed errata file, and writes nothing', () => {
    writeDataset([{ ...ERRATUM, reason: '' }]);
    const out = join(dataset, 'out');
    const res = analyze(dataset, out);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('errata[0].reason: must be a non-empty string');
    expect(existsSync(out)).toBe(false);
  });

  it('never reads index/ files as runs', () => {
    writeDataset([ERRATUM]);
    const out = join(dataset, 'out');
    analyze(dataset, out);
    const validation = readFileSync(join(out, 'validation.txt'), 'utf8');
    expect(validation).not.toContain('index/');
    expect(validation.trimEnd().split('\n')).toHaveLength(3);
  });
});
