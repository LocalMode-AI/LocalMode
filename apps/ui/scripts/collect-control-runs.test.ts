/**
 * The control-run collector over a copy of the fixture dataset clone
 * (`__fixtures__/study-dataset`). The exports are fixture runs given a new
 * run id, a `createdAt`, the `harness.control` record a control page writes,
 * and a digest computed as the page computes it, which is the file Export
 * JSON saves. The CLI runs as a real process for the write, refusal and
 * dry-run paths; the written files are read back and verified.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  computeRunDigest,
  createHarnessControl,
  RUNTIME_EXECUTION_ORDER,
  validateSubmission,
  verifyRunDigest,
  type BenchRunResult,
  type ControlKind,
} from '@localmode/bench';
import { collectControlRuns, CollectControlRunsError, controlRunPath } from './collect-control-runs';

const here = dirname(fileURLToPath(import.meta.url));
const TSX = join(here, '..', 'node_modules', '.bin', 'tsx');
const SCRIPT = join(here, 'collect-control-runs.ts');
const FIXTURE = join(here, '__fixtures__', 'study-dataset');
const SOURCE_RUN = 'runs/2026/10/study-run-firefox.json';

let dataset: string;
let exportsDir: string;

/** Every file in the clone, relative path to bytes. */
function snapshot(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string) => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else out.set(relative(dir, p).split(sep).join('/'), readFileSync(p, 'utf8'));
    }
  };
  walk(dir);
  return out;
}

/** The file a control page's Export JSON saves. */
async function controlExport(
  runId: string,
  createdAt: string,
  withControl = true,
  kind: ControlKind = 'order-reversed',
): Promise<BenchRunResult> {
  const run = JSON.parse(readFileSync(join(FIXTURE, SOURCE_RUN), 'utf8')) as BenchRunResult;
  run.runId = runId;
  run.createdAt = createdAt;
  if (withControl) run.harness = { ...run.harness, control: createHarnessControl(kind) };
  delete run.nonce;
  run.digest = await computeRunDigest(run);
  return run;
}

async function writeExport(name: string, run: BenchRunResult): Promise<string> {
  const path = join(exportsDir, name);
  writeFileSync(path, JSON.stringify(run, null, 2));
  return path;
}

function cli(...args: string[]) {
  return spawnSync(TSX, [SCRIPT, '--dataset', dataset, ...args], { encoding: 'utf8', timeout: 60_000 });
}

describe('collect-control-runs', () => {
  beforeEach(() => {
    dataset = mkdtempSync(join(tmpdir(), 'bench-controls-'));
    cpSync(FIXTURE, dataset, { recursive: true });
    exportsDir = mkdtempSync(join(tmpdir(), 'bench-control-exports-'));
  });
  afterEach(() => {
    rmSync(dataset, { recursive: true, force: true });
    rmSync(exportsDir, { recursive: true, force: true });
  });

  it('files every export of a folder under controls/<kind>/<date>/<runId>.json and leaves everything else untouched', async () => {
    const a = await controlExport('control-run-a', '2026-10-14T09:15:00.000Z');
    const b = await controlExport('control-run-b', '2026-10-15T23:59:59.000Z');
    await writeExport('localmode-bench-control-run-a.json', a);
    await writeExport('localmode-bench-control-run-b.json', b);
    const before = snapshot(dataset);

    const out = cli('--dir', exportsDir);
    expect(out.stderr).toBe('');
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('2 control runs; index/summary.json untouched');

    const after = snapshot(dataset);
    const added = [...after.keys()].filter((k) => !before.has(k)).sort();
    expect(added).toEqual([
      'controls/order-reversed/2026-10-14/control-run-a.json',
      'controls/order-reversed/2026-10-15/control-run-b.json',
    ]);
    // Nothing that existed changed: not the index, not a run file.
    for (const [path, bytes] of before) expect(after.get(path)).toBe(bytes);

    // The filed run is the export, as compact JSON, verifiable and carrying the reversed order.
    const filed = JSON.parse(after.get(added[0])!) as BenchRunResult;
    expect(after.get(added[0])).toBe(JSON.stringify(a));
    expect(await verifyRunDigest(filed)).toBe(true);
    expect(filed.harness.control).toEqual({ kind: 'order-reversed', runtimeOrder: [...RUNTIME_EXECUTION_ORDER].reverse() });
    expect(validateSubmission(filed).shapeErrors).toEqual([]);
    expect(controlRunPath(filed)).toBe(added[0]);
  }, 120_000);

  it('files a fixed-order export under controls/fixed-order/<date>/ beside an order-reversed one, index untouched', async () => {
    const fixed = await controlExport('control-run-fixed', '2026-10-16T08:00:00.000Z', true, 'fixed-order');
    const reversed = await controlExport('control-run-rev', '2026-10-16T10:00:00.000Z');
    const fixedFile = await writeExport('fixed.json', fixed);
    const reversedFile = await writeExport('reversed.json', reversed);
    const before = snapshot(dataset);

    const out = cli('--file', fixedFile, '--file', reversedFile);
    expect(out.stderr).toBe('');
    expect(out.status).toBe(0);
    expect(out.stdout).toContain(`controls/fixed-order/2026-10-16/control-run-fixed.json <- ${fixedFile} (fixed-order,`);
    expect(out.stdout).toContain('2 control runs; index/summary.json untouched');

    const after = snapshot(dataset);
    const added = [...after.keys()].filter((k) => !before.has(k)).sort();
    expect(added).toEqual([
      'controls/fixed-order/2026-10-16/control-run-fixed.json',
      'controls/order-reversed/2026-10-16/control-run-rev.json',
    ]);
    for (const [path, bytes] of before) expect(after.get(path)).toBe(bytes);
    const filed = JSON.parse(after.get(added[0])!) as BenchRunResult;
    expect(after.get(added[0])).toBe(JSON.stringify(fixed));
    expect(await verifyRunDigest(filed)).toBe(true);
    expect(filed.harness.control).toEqual({ kind: 'fixed-order', runtimeOrder: [...RUNTIME_EXECUTION_ORDER] });
    expect(controlRunPath(filed)).toBe(added[0]);
  }, 120_000);

  it('refuses a fixed-order marker carrying the reversed order, writing nothing', async () => {
    const run = await controlExport('control-run-fixed-bad', '2026-10-16T09:00:00.000Z', true, 'fixed-order');
    run.harness = { ...run.harness, control: { kind: 'fixed-order', runtimeOrder: [...RUNTIME_EXECUTION_ORDER].reverse() } };
    run.digest = await computeRunDigest(run);
    const file = await writeExport('fixed-bad.json', run);
    const before = snapshot(dataset);
    await expect(collectControlRuns({ datasetDir: dataset, files: [file] })).rejects.toThrow(
      `${file}: invalid shape: harness.control.runtimeOrder must be the fixed-order order [${RUNTIME_EXECUTION_ORDER.join(', ')}]`,
    );
    expect(snapshot(dataset)).toEqual(before);
  }, 120_000);

  it('drops a nonce an export carries, as the publication scrub does, keeping the digest', async () => {
    const run = await controlExport('control-run-nonce', '2026-10-14T10:00:00.000Z');
    run.nonce = 'expired.session.token';
    const file = await writeExport('with-nonce.json', run);
    const result = await collectControlRuns({ datasetDir: dataset, files: [file] });
    const filed = JSON.parse(readFileSync(join(dataset, result.collected[0].path), 'utf8')) as BenchRunResult;
    expect(filed.nonce).toBeUndefined();
    expect(filed.digest).toBe(run.digest);
    expect(await verifyRunDigest(filed)).toBe(true);
  }, 120_000);

  it('refuses a protocol run, a tampered export and a run already in the dataset, writing nothing', async () => {
    const good = await writeExport('good.json', await controlExport('control-run-good', '2026-10-14T09:00:00.000Z'));
    const protocol = await writeExport('protocol.json', await controlExport('protocol-run-x', '2026-10-14T09:00:00.000Z', false));
    const tamperedRun = await controlExport('control-run-tampered', '2026-10-14T09:00:00.000Z');
    tamperedRun.environment.hardware.cores = (tamperedRun.environment.hardware.cores ?? 4) + 1;
    const tampered = await writeExport('tampered.json', tamperedRun);
    const existing = await writeExport('existing.json', await controlExport('study-run-approve-1', '2026-10-14T09:00:00.000Z'));
    const before = snapshot(dataset);

    await expect(collectControlRuns({ datasetDir: dataset, files: [good, protocol] })).rejects.toThrow(
      new CollectControlRunsError(
        `${protocol}: not a control run (no harness.control); import a protocol run with scripts/import-exported-run.ts`,
      ),
    );
    await expect(collectControlRuns({ datasetDir: dataset, files: [good, tampered] })).rejects.toThrow(
      `${tampered}: the digest is missing or wrong; the file is not what the page exported`,
    );
    await expect(collectControlRuns({ datasetDir: dataset, files: [existing] })).rejects.toThrow(
      `${existing}: run study-run-approve-1 is already in the dataset: runs/2026/10/study-run-approve-1.json`,
    );
    await expect(collectControlRuns({ datasetDir: dataset, files: [good, good] })).rejects.toThrow(
      `${good}: run control-run-good is also in ${good}`,
    );
    const out = cli('--file', good, '--file', protocol);
    expect(out.status).toBe(1);
    expect(out.stderr).toContain('not a control run');
    // All or nothing: the good file was not written either.
    expect(snapshot(dataset)).toEqual(before);

    // Collected once, a second collection of the same run is refused.
    expect(cli('--file', good).status).toBe(0);
    const again = cli('--file', good);
    expect(again.status).toBe(1);
    expect(again.stderr).toContain('run control-run-good is already in the dataset: controls/order-reversed/2026-10-14/control-run-good.json');
  }, 120_000);

  it('refuses a malformed control marker with the validator\'s shape error', async () => {
    const run = await controlExport('control-run-bad', '2026-10-14T09:00:00.000Z');
    run.harness = { ...run.harness, control: { kind: 'order-reversed', runtimeOrder: [...RUNTIME_EXECUTION_ORDER] } };
    run.digest = await computeRunDigest(run);
    const file = await writeExport('bad.json', run);
    await expect(collectControlRuns({ datasetDir: dataset, files: [file] })).rejects.toThrow(
      `${file}: invalid shape: harness.control.runtimeOrder must be the order-reversed order [${[...RUNTIME_EXECUTION_ORDER].reverse().join(', ')}]`,
    );
  }, 120_000);

  it('--dry-run prints the paths and writes nothing; a folder that is not a clone is refused', async () => {
    const file = await writeExport('a.json', await controlExport('control-run-dry', '2026-10-14T09:00:00.000Z'));
    const before = snapshot(dataset);
    const out = cli('--file', file, '--dry-run');
    expect(out.status).toBe(0);
    expect(out.stdout).toContain(`controls/order-reversed/2026-10-14/control-run-dry.json <- ${file} (order-reversed,`);
    expect(out.stdout).toContain('dry run: nothing written');
    expect(snapshot(dataset)).toEqual(before);

    const notClone = mkdtempSync(join(tmpdir(), 'bench-not-clone-'));
    mkdirSync(join(notClone, 'index'));
    await expect(collectControlRuns({ datasetDir: notClone, files: [file] })).rejects.toThrow(
      `${notClone} has no runs/ directory; pass --dataset <clone>`,
    );
    expect(existsSync(join(notClone, 'controls'))).toBe(false);
    rmSync(notClone, { recursive: true, force: true });
  }, 120_000);
});
