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
  LLAMACPP_PROFILE_BIN_EDGES_MS,
  summarizeGaps,
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
  if (withControl) {
    const control =
      kind === 'wasm-default' || kind === 'wasm-threads'
        ? createHarnessControl(kind, { numThreads: 8 })
        : kind === 'current-releases'
          ? createHarnessControl(kind, { runtimeVersions: { '@huggingface/transformers': '4.3.1', '@mlc-ai/web-llm': '0.2.86', '@wllama/wllama': '3.8.1', '@wllama/wllama-compat': '3.8.1', '@litert-lm/core': '0.18.0' } })
          : createHarnessControl(kind);
    run.harness = { ...run.harness, control };
  }
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

  it('files a wasm-default export under controls/wasm-default/<date>/ with its wasmLane, index untouched', async () => {
    const wasm = await controlExport('control-run-wasm', '2026-10-17T08:00:00.000Z', true, 'wasm-default');
    const file = await writeExport('wasm.json', wasm);
    const before = snapshot(dataset);

    const out = cli('--file', file);
    expect(out.stderr).toBe('');
    expect(out.status).toBe(0);
    expect(out.stdout).toContain(`controls/wasm-default/2026-10-17/control-run-wasm.json <- ${file} (wasm-default,`);
    expect(out.stdout).toContain('1 control run; index/summary.json untouched');

    const after = snapshot(dataset);
    const added = [...after.keys()].filter((k) => !before.has(k)).sort();
    expect(added).toEqual(['controls/wasm-default/2026-10-17/control-run-wasm.json']);
    for (const [path, bytes] of before) expect(after.get(path)).toBe(bytes);
    const filed = JSON.parse(after.get(added[0])!) as BenchRunResult;
    expect(after.get(added[0])).toBe(JSON.stringify(wasm));
    expect(await verifyRunDigest(filed)).toBe(true);
    expect(filed.harness.control).toEqual({
      kind: 'wasm-default',
      runtimeOrder: [...RUNTIME_EXECUTION_ORDER],
      wasmLane: { dtype: 'q8', numThreads: 8, simd: true },
    });
    expect(validateSubmission(filed).shapeErrors).toEqual([]);
  }, 120_000);

  it('refuses a wasm-default marker without its wasmLane, writing nothing', async () => {
    const run = await controlExport('control-run-wasm-bad', '2026-10-17T09:00:00.000Z', true, 'wasm-default');
    run.harness = { ...run.harness, control: { kind: 'wasm-default', runtimeOrder: [...RUNTIME_EXECUTION_ORDER] } };
    run.digest = await computeRunDigest(run);
    const file = await writeExport('wasm-bad.json', run);
    const before = snapshot(dataset);
    await expect(collectControlRuns({ datasetDir: dataset, files: [file] })).rejects.toThrow(
      `${file}: invalid shape: harness.control.wasmLane must be { dtype: 'q8', numThreads: <integer 1-1024>, simd: true } on a wasm-default control run`,
    );
    expect(snapshot(dataset)).toEqual(before);
  }, 120_000);

  it.each([
    { kind: 'wasm-q8' as const, wasmLane: { dtype: 'q8', numThreads: null, simd: true } },
    { kind: 'wasm-threads' as const, wasmLane: { dtype: 'q4', numThreads: 8, simd: true } },
  ])('files a $kind export under controls/$kind/<date>/ with its wasmLane, index untouched', async ({ kind, wasmLane }) => {
    const run = await controlExport(`control-run-${kind}`, '2026-10-21T08:00:00.000Z', true, kind);
    const file = await writeExport(`${kind}.json`, run);
    const before = snapshot(dataset);

    const out = cli('--file', file);
    expect(out.stderr).toBe('');
    expect(out.status).toBe(0);
    expect(out.stdout).toContain(`controls/${kind}/2026-10-21/control-run-${kind}.json <- ${file} (${kind},`);
    expect(out.stdout).toContain('1 control run; index/summary.json untouched');

    const after = snapshot(dataset);
    const added = [...after.keys()].filter((k) => !before.has(k)).sort();
    expect(added).toEqual([`controls/${kind}/2026-10-21/control-run-${kind}.json`]);
    for (const [path, bytes] of before) expect(after.get(path)).toBe(bytes);
    const filed = JSON.parse(after.get(added[0])!) as BenchRunResult;
    expect(after.get(added[0])).toBe(JSON.stringify(run));
    expect(await verifyRunDigest(filed)).toBe(true);
    expect(filed.harness.control).toEqual({ kind, runtimeOrder: [...RUNTIME_EXECUTION_ORDER], wasmLane });
    expect(validateSubmission(filed).shapeErrors).toEqual([]);
  }, 120_000);

  it('refuses a wasm-q8 marker carrying a thread count, writing nothing', async () => {
    const run = await controlExport('control-run-q8-bad', '2026-10-21T09:00:00.000Z', true, 'wasm-q8');
    run.harness = {
      ...run.harness,
      control: { kind: 'wasm-q8', runtimeOrder: [...RUNTIME_EXECUTION_ORDER], wasmLane: { dtype: 'q8', numThreads: 8, simd: true } },
    };
    run.digest = await computeRunDigest(run);
    const file = await writeExport('q8-bad.json', run);
    const before = snapshot(dataset);
    await expect(collectControlRuns({ datasetDir: dataset, files: [file] })).rejects.toThrow(
      `${file}: invalid shape: harness.control.wasmLane must be { dtype: 'q8', numThreads: null, simd: true } on a wasm-q8 control run`,
    );
    expect(snapshot(dataset)).toEqual(before);
  }, 120_000);

  it('files a wllama-compat export under controls/wllama-compat/<date>/ with its build record, index untouched', async () => {
    const run = await controlExport('control-run-wllama-compat', '2026-10-22T08:00:00.000Z', true, 'wllama-compat');
    // As a real wllama-compat run records it: the llama.cpp cell ran on the compatibility build.
    run.cells = run.cells.map((c) => ({ ...c, runtimeConfig: { n_gpu_layers: 0, offloadedLayers: '0/31', wllamaBuild: 'compat' } }));
    run.digest = await computeRunDigest(run);
    const file = await writeExport('wllama-compat.json', run);
    const before = snapshot(dataset);

    const out = cli('--file', file);
    expect(out.stderr).toBe('');
    expect(out.status).toBe(0);
    expect(out.stdout).toContain(`controls/wllama-compat/2026-10-22/control-run-wllama-compat.json <- ${file} (wllama-compat,`);
    expect(out.stdout).toContain('1 control run; index/summary.json untouched');

    const after = snapshot(dataset);
    const added = [...after.keys()].filter((k) => !before.has(k)).sort();
    expect(added).toEqual(['controls/wllama-compat/2026-10-22/control-run-wllama-compat.json']);
    for (const [path, bytes] of before) expect(after.get(path)).toBe(bytes);
    const filed = JSON.parse(after.get(added[0])!) as BenchRunResult;
    expect(after.get(added[0])).toBe(JSON.stringify(run));
    expect(await verifyRunDigest(filed)).toBe(true);
    expect(filed.harness.control).toEqual({ kind: 'wllama-compat', runtimeOrder: [...RUNTIME_EXECUTION_ORDER], wllamaBuild: 'compat' });
    expect(filed.cells.map((c) => c.runtimeConfig?.wllamaBuild)).toEqual(['compat']);
    expect(validateSubmission(filed).shapeErrors).toEqual([]);
  }, 120_000);

  it('refuses a wllama-compat export whose llama.cpp cell ran on the memory64 build, writing nothing', async () => {
    const run = await controlExport('control-run-compat-bad', '2026-10-22T09:00:00.000Z', true, 'wllama-compat');
    run.cells = run.cells.map((c) => ({ ...c, runtimeConfig: { n_gpu_layers: 0, offloadedLayers: '0/31', wllamaBuild: 'memory64' } }));
    run.digest = await computeRunDigest(run);
    const file = await writeExport('compat-bad.json', run);
    const before = snapshot(dataset);
    await expect(collectControlRuns({ datasetDir: dataset, files: [file] })).rejects.toThrow(
      `${file}: invalid shape: cells[0]: runtimeConfig.wllamaBuild is "memory64" on a wllama-compat control run, which loads every llama.cpp lane through the compatibility build`,
    );
    expect(snapshot(dataset)).toEqual(before);
  }, 120_000);

  it('files current-releases, ort-profile and llamacpp-profile exports under controls/<kind>/<date>/ with their records, index untouched', async () => {
    const current = await controlExport('control-run-current', '2026-10-23T08:00:00.000Z', true, 'current-releases');
    // As a real current-releases run records it: the llama.cpp cell ran wllama 3.8.1.
    current.cells = current.cells.map((c) => ({ ...c, runtimeVersion: '3.8.1', runtimeConfig: { n_gpu_layers: 0, offloadedLayers: '0/31', runtimeVersion: '3.8.1' } }));
    current.digest = await computeRunDigest(current);
    const delivery = await controlExport('control-run-llamacpp', '2026-10-23T09:00:00.000Z', true, 'llamacpp-profile');
    const gaps = summarizeGaps([647, 648]);
    delivery.cells = delivery.cells.map((c) => ({
      ...c,
      profile: {
        kind: 'llamacpp-delivery' as const,
        binEdgesMs: [...LLAMACPP_PROFILE_BIN_EDGES_MS],
        iterations: [{ tokens: 3, chunks: 3, messages: 3, emitGapMs: gaps, recvGapMs: gaps, chunkGapMs: gaps, workerMs: gaps, roundTripTransitMs: gaps, receiptToChunkMs: gaps, pageTurnaroundMs: gaps, clockOffsetMs: 0.4 }],
      },
    }));
    delivery.digest = await computeRunDigest(delivery);
    const ort = await controlExport('control-run-ort', '2026-10-23T10:00:00.000Z', true, 'ort-profile');
    const files = [await writeExport('current.json', current), await writeExport('delivery.json', delivery), await writeExport('ort.json', ort)];
    const before = snapshot(dataset);

    const out = cli(...files.flatMap((f) => ['--file', f]));
    expect(out.stderr).toBe('');
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('3 control runs; index/summary.json untouched');
    const after = snapshot(dataset);
    const added = [...after.keys()].filter((k) => !before.has(k)).sort();
    expect(added).toEqual([
      'controls/current-releases/2026-10-23/control-run-current.json',
      'controls/llamacpp-profile/2026-10-23/control-run-llamacpp.json',
      'controls/ort-profile/2026-10-23/control-run-ort.json',
    ]);
    for (const [path, bytes] of before) expect(after.get(path)).toBe(bytes);
    const filed = JSON.parse(after.get(added[0])!) as BenchRunResult;
    expect(filed.harness.control?.runtimeVersions?.['@huggingface/transformers']).toBe('4.3.1');
    expect(await verifyRunDigest(filed)).toBe(true);
    const filedDelivery = JSON.parse(after.get(added[1])!) as BenchRunResult;
    expect(filedDelivery.cells[0].profile?.kind).toBe('llamacpp-delivery');
    expect(validateSubmission(filedDelivery).shapeErrors).toEqual([]);
  }, 120_000);

  it('refuses a profile on a run of another kind, and a current-releases cell that ran the pinned release, writing nothing', async () => {
    const stray = await controlExport('control-run-stray-profile', '2026-10-23T11:00:00.000Z', true, 'fixed-order');
    stray.cells = stray.cells.map((c) => ({
      ...c,
      profile: { kind: 'llamacpp-delivery' as const, binEdgesMs: [...LLAMACPP_PROFILE_BIN_EDGES_MS], iterations: [] },
    }));
    stray.digest = await computeRunDigest(stray);
    const strayFile = await writeExport('stray.json', stray);
    const pinned = await controlExport('control-run-pinned', '2026-10-23T12:00:00.000Z', true, 'current-releases');
    pinned.cells = pinned.cells.map((c) => ({ ...c, runtimeConfig: { n_gpu_layers: 0, runtimeVersion: '3.5.1' } }));
    pinned.digest = await computeRunDigest(pinned);
    const pinnedFile = await writeExport('pinned.json', pinned);
    const before = snapshot(dataset);
    await expect(collectControlRuns({ datasetDir: dataset, files: [strayFile] })).rejects.toThrow(
      `${strayFile}: invalid shape: cells[0]: profile is set only on a ort-profile or llamacpp-profile control run`,
    );
    await expect(collectControlRuns({ datasetDir: dataset, files: [pinnedFile] })).rejects.toThrow(
      `${pinnedFile}: invalid shape: cells[0]: runtimeConfig.runtimeVersion is "3.5.1" but harness.control.runtimeVersions gives @wllama/wllama "3.8.1"`,
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
