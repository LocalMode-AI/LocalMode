/**
 * The run-field scrub tool over a copy of the fixture dataset clone
 * (`__fixtures__/study-dataset`). One study run is given a GPU answer that
 * carries a Windows computer name, with a digest computed over it as the
 * page computes it, and the tool is run as a real process against the copy:
 * the run file keeps the dataset's layout, its recomputed digest verifies,
 * `scrubbedAt` is stamped, only the `reportedGpu` of the run's index entry
 * changes, and a field outside the participant's answers is refused with
 * nothing written.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeRunDigest, validateSubmission, verifyRunDigest, type BenchRunResult } from '@localmode/bench';
import type { RunIndexEntry } from '../src/lib/bench/store';
import { scrubRunField, ScrubFieldError } from './scrub-run-field';

const here = dirname(fileURLToPath(import.meta.url));
const TSX = join(here, '..', 'node_modules', '.bin', 'tsx');
const SCRIPT = join(here, 'scrub-run-field.ts');
const FIXTURE = join(here, '__fixtures__', 'study-dataset');
const RUN_ID = 'study-run-approve-1';
const RUN_PATH = `runs/2026/10/${RUN_ID}.json`;
const TYPED = 'Processador Intel(R) Core(TM) i5-3330S CPU @ 2.7DESKTOP-A1B2C3D';

let dataset: string;

const readText = (p: string) => readFileSync(join(dataset, p), 'utf8');
const readRun = () => JSON.parse(readText(RUN_PATH)) as BenchRunResult;
const readIndex = () => JSON.parse(readText('index/summary.json')) as RunIndexEntry[];

function cli(...args: string[]) {
  return spawnSync(TSX, [SCRIPT, '--dataset', dataset, ...args], { encoding: 'utf8', timeout: 60_000 });
}

describe('scrub-run-field', () => {
  beforeEach(async () => {
    dataset = mkdtempSync(join(tmpdir(), 'bench-scrub-'));
    cpSync(FIXTURE, dataset, { recursive: true });
    // Publish the run as a submission carrying a computer name would have been
    // published before the guard: the answer as typed, digest over it.
    const run = readRun();
    run.environment = { ...run.environment, userReportedHardware: { ...run.environment.userReportedHardware, gpu: TYPED } };
    run.digest = await computeRunDigest(run);
    writeFileSync(join(dataset, RUN_PATH), JSON.stringify(run));
    const index = readIndex().map((e) => (e.runId === RUN_ID ? { ...e, reportedGpu: TYPED } : e));
    writeFileSync(join(dataset, 'index/summary.json'), JSON.stringify(index));
  });
  afterEach(() => {
    rmSync(dataset, { recursive: true, force: true });
  });

  it('sanitizes the GPU answer through the publication path and keeps every other byte', async () => {
    const runBefore = readRun();
    const indexBefore = readIndex();
    expect(await verifyRunDigest(runBefore)).toBe(true);

    const out = cli('--run', RUN_ID, '--field', 'environment.userReportedHardware.gpu', '--sanitize');
    expect(out.stderr).toBe('');
    expect(out.status).toBe(0);
    expect(out.stdout).toContain(`- environment.userReportedHardware.gpu: ${JSON.stringify(TYPED)}`);
    expect(out.stdout).toContain(
      '+ environment.userReportedHardware.gpu: "Processador Intel(R) Core(TM) i5-3330S CPU @ 2.7"',
    );

    const raw = readText(RUN_PATH);
    expect(raw).not.toContain('DESKTOP-A1B2C3D');
    const runAfter = JSON.parse(raw) as BenchRunResult;
    // Same compact layout as the dataset writes, no trailing newline.
    expect(raw).toBe(JSON.stringify(runAfter));
    expect(runAfter.environment.userReportedHardware?.gpu).toBe('Processador Intel(R) Core(TM) i5-3330S CPU @ 2.7');
    expect(Number.isNaN(Date.parse(runAfter.scrubbedAt ?? ''))).toBe(false);
    expect(runAfter.digest).not.toBe(runBefore.digest);
    expect(await verifyRunDigest(runAfter)).toBe(true);
    expect(validateSubmission(runAfter, { anyProtocol: true }).shapeErrors).toEqual([]);
    // Nothing else in the run changed: the run with the old answer, the old
    // digest, and no scrubbedAt is the file as it was.
    const { scrubbedAt: _stamp, ...rest } = runAfter;
    expect({
      ...rest,
      digest: runBefore.digest,
      environment: { ...rest.environment, userReportedHardware: { ...rest.environment.userReportedHardware, gpu: TYPED } },
    }).toEqual(runBefore);

    // The index: only that entry's reportedGpu changed.
    const indexAfter = readIndex();
    expect(readText('index/summary.json')).toBe(JSON.stringify(indexAfter));
    expect(indexAfter).toEqual(
      indexBefore.map((e) =>
        e.runId === RUN_ID ? { ...e, reportedGpu: 'Processador Intel(R) Core(TM) i5-3330S CPU @ 2.7' } : e,
      ),
    );
  });

  it('sets a given value, and a dry run writes nothing', async () => {
    const runText = readText(RUN_PATH);
    const indexText = readText('index/summary.json');
    const dry = await scrubRunField({
      datasetDir: dataset,
      runId: RUN_ID,
      field: 'environment.userReportedHardware.gpu',
      edit: { kind: 'value', value: 'Intel HD Graphics 2500' },
      dryRun: true,
    });
    expect(dry.after).toBe('Intel HD Graphics 2500');
    expect(dry.indexChanges).toEqual([{ key: 'reportedGpu', before: TYPED, after: 'Intel HD Graphics 2500' }]);
    expect(readText(RUN_PATH)).toBe(runText);
    expect(readText('index/summary.json')).toBe(indexText);

    await scrubRunField({
      datasetDir: dataset,
      runId: RUN_ID,
      field: 'environment.userReportedHardware.gpu',
      edit: { kind: 'value', value: 'Intel HD Graphics 2500' },
      now: new Date('2026-10-02T12:00:00.000Z'),
    });
    const run = readRun();
    expect(run.environment.userReportedHardware?.gpu).toBe('Intel HD Graphics 2500');
    expect(run.scrubbedAt).toBe('2026-10-02T12:00:00.000Z');
    expect(await verifyRunDigest(run)).toBe(true);
    expect(readIndex().find((e) => e.runId === RUN_ID)?.reportedGpu).toBe('Intel HD Graphics 2500');
  });

  it.each([
    'environment.gpu.description',
    'environment.os.version',
    'runId',
    'environment.userReportedHardware',
    'environment.userReportedHardware.gpu.length',
  ])('refuses to edit %s and writes nothing', (field) => {
    const runText = readText(RUN_PATH);
    const indexText = readText('index/summary.json');
    const out = cli('--run', RUN_ID, '--field', field, '--value', 'x');
    expect(out.status).toBe(1);
    expect(out.stderr).toContain(`refusing to edit ${field}`);
    expect(readText(RUN_PATH)).toBe(runText);
    expect(readText('index/summary.json')).toBe(indexText);
  });

  it('refuses an edit that changes nothing, and --sanitize on a field other than the GPU name', async () => {
    await scrubRunField({
      datasetDir: dataset,
      runId: RUN_ID,
      field: 'environment.userReportedHardware.gpu',
      edit: { kind: 'sanitize' },
    });
    await expect(
      scrubRunField({ datasetDir: dataset, runId: RUN_ID, field: 'environment.userReportedHardware.gpu', edit: { kind: 'sanitize' } }),
    ).rejects.toThrow(ScrubFieldError);
    await expect(
      scrubRunField({ datasetDir: dataset, runId: RUN_ID, field: 'environment.userReportedDevice', edit: { kind: 'sanitize' } }),
    ).rejects.toThrow('--sanitize applies to environment.userReportedHardware.gpu only');
  });
});
