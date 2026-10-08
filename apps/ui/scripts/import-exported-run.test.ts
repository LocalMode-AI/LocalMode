/**
 * The exported-run import tool over a copy of the fixture dataset clone
 * (`__fixtures__/study-dataset`). The export is a fixture study run given a
 * new run id, a later `createdAt`, an expired nonce and a digest computed as
 * the page computes it, which is the file Export JSON saves. The same body is
 * also posted to the real submit route (only the GitHub boundary is stubbed,
 * the store's documented mock layer) with a fresh nonce, so the test compares
 * the bytes the tool writes with the bytes the route commits. The CLI runs
 * as a real process for the write, refusal and dry-run paths.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { computeRunDigest, verifyRunDigest, type BenchRunResult } from '@localmode/bench';
import { issueNonce } from '../src/lib/bench/nonce';
import type { RunIndexEntry } from '../src/lib/bench/store';
import { importExportedRun, ImportRunError } from './import-exported-run';
import { buildIndexFromDataset, serializeIndex } from './rebuild-bench-index';

const here = dirname(fileURLToPath(import.meta.url));
const TSX = join(here, '..', 'node_modules', '.bin', 'tsx');
const SCRIPT = join(here, 'import-exported-run.ts');
const FIXTURE = join(here, '__fixtures__', 'study-dataset');
const SOURCE_RUN = 'runs/2026/10/study-run-firefox.json';
const RUN_ID = 'study-run-exported-1';
const RUN_PATH = `runs/2026/10/${RUN_ID}.json`;

let dataset: string;
let scratch: string;
let exportPath: string;

const readText = (p: string) => readFileSync(join(dataset, p), 'utf8');
const readIndex = () => JSON.parse(readText('index/summary.json')) as RunIndexEntry[];

/** The file a participant's Export JSON saves: the run with the nonce its run started with, and the page's digest. */
async function exportedRun(source = SOURCE_RUN): Promise<BenchRunResult> {
  const run = JSON.parse(readFileSync(join(FIXTURE, source), 'utf8')) as BenchRunResult;
  run.runId = RUN_ID;
  run.createdAt = '2026-10-03T08:00:00.000Z';
  run.environment = { ...run.environment, userReportedDevice: 'prolific:0f1e2d3c4b5a' };
  run.nonce = issueNonce(Date.now() - 25 * 3600_000);
  run.digest = await computeRunDigest(run);
  return run;
}

function cli(...args: string[]) {
  return spawnSync(TSX, [SCRIPT, '--dataset', dataset, '--file', exportPath, ...args], {
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, BENCH_NONCE_SECRET: 'unit-test-secret' },
  });
}

/** What the real route commits for a body, read at the GitHub boundary. */
async function routeOutput(body: BenchRunResult): Promise<{ status: number; fileText: string; entry: RunIndexEntry }> {
  let fileText = '';
  let indexBody = '[]';
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/contents/index/summary.json')) {
      if (init?.method === 'PUT') {
        indexBody = Buffer.from(JSON.parse(String(init.body)).content, 'base64').toString();
        return new Response('{}', { status: 200 });
      }
      return Response.json({ type: 'file', sha: 'abc', size: Buffer.byteLength(indexBody), content: '', encoding: 'none' });
    }
    if (url.endsWith('/git/blobs/abc')) {
      return Response.json({ sha: 'abc', size: Buffer.byteLength(indexBody), encoding: 'base64', content: Buffer.from(indexBody).toString('base64') });
    }
    if (init?.method === 'PUT' && url.includes('/contents/')) {
      fileText = Buffer.from((JSON.parse(String(init.body)) as { content: string }).content, 'base64').toString('utf8');
      return new Response('{}', { status: 201 });
    }
    return new Response('{}', { status: 404 });
  });
  const { POST } = await import('../src/app/api/bench/submit/route');
  const res = await POST(
    new NextRequest('https://localmode.ai/api/bench/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.77' },
      body: JSON.stringify(body),
    }),
  );
  vi.unstubAllGlobals();
  const [entry] = JSON.parse(indexBody) as RunIndexEntry[];
  return { status: res.status, fileText, entry };
}

describe('import-exported-run', () => {
  beforeEach(async () => {
    process.env.BENCH_GITHUB_REPO = 'example/bench-data';
    process.env.BENCH_GITHUB_TOKEN = 'test-token';
    process.env.BENCH_NONCE_SECRET = 'unit-test-secret';
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.KV_REST_API_URL;
    dataset = mkdtempSync(join(tmpdir(), 'bench-import-'));
    cpSync(FIXTURE, dataset, { recursive: true });
    scratch = mkdtempSync(join(tmpdir(), 'bench-export-'));
    exportPath = join(scratch, `localmode-bench-${RUN_ID}.json`);
    writeFileSync(exportPath, JSON.stringify(await exportedRun(), null, 2));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(dataset, { recursive: true, force: true });
    rmSync(scratch, { recursive: true, force: true });
  });

  it('imports a valid export at the route path with the route bytes, and an index entry marked importedAt', async () => {
    const indexTextBefore = readText('index/summary.json');
    const indexBefore = readIndex();
    const out = cli();
    expect(out.stderr).toBe('');
    expect(out.status).toBe(0);
    expect(out.stdout).toContain(`run file: ${RUN_PATH} (runs: verified`);
    expect(out.stdout).toContain('flags: none');
    expect(out.stdout).toContain('written');

    // The run file: what the route commits for the same body (with a live nonce in place of the expired one).
    const exported = JSON.parse(readFileSync(exportPath, 'utf8')) as BenchRunResult;
    const route = await routeOutput({ ...exported, nonce: issueNonce() });
    expect(route.status).toBe(200);
    const fileText = readText(RUN_PATH);
    expect(fileText).toBe(route.fileText);
    const published = JSON.parse(fileText) as BenchRunResult;
    expect(published.nonce).toBeUndefined();
    expect(published.scrubbedAt).toBeUndefined();
    expect(published.digest).toBe(exported.digest);
    expect(await verifyRunDigest(published)).toBe(true);

    // The index: every earlier byte kept, one entry appended, equal to the route's plus importedAt.
    const indexText = readText('index/summary.json');
    expect(indexText.startsWith(indexTextBefore.slice(0, -1))).toBe(true);
    const index = readIndex();
    expect(index.slice(0, -1)).toEqual(indexBefore);
    const { importedAt, ...entry } = index.at(-1)!;
    expect(Number.isNaN(Date.parse(importedAt ?? ''))).toBe(false);
    expect(JSON.stringify(entry)).toBe(JSON.stringify(route.entry));
    expect(Object.keys(index.at(-1)!).at(-1)).toBe('importedAt');
    expect(entry).toMatchObject({ runId: RUN_ID, flagged: false, path: RUN_PATH, userReportedDevice: 'prolific:0f1e2d3c4b5a' });

    // A rebuild of the index from the run files reproduces it byte for byte, importedAt included.
    const rebuilt = buildIndexFromDataset(dataset, index);
    expect(rebuilt.problems).toEqual([]);
    expect(serializeIndex(rebuilt.entries)).toBe(indexText);
  }, 120_000);

  it('a flagged export goes to quarantine/ with its flags, as the route would send it', async () => {
    // This fixture run claims an Apple GPU on Windows: a reject-severity plausibility finding.
    writeFileSync(exportPath, JSON.stringify(await exportedRun('runs/2026/10/study-run-approve-1.json')));
    const result = await importExportedRun({ datasetDir: dataset, file: exportPath, now: new Date('2026-10-07T18:00:00.000Z') });
    expect(result.path).toBe(`quarantine/2026/10/${RUN_ID}.json`);
    expect(result.flagged).toBe(true);
    expect(result.flags).toEqual([{ code: 'env-cross-field', message: 'Apple GPU adapter with Windows platform', severity: 'reject' }]);
    expect(readText(result.path)).toBe(result.fileText);
    expect(readIndex().at(-1)).toMatchObject({ runId: RUN_ID, flagged: true, path: result.path, importedAt: '2026-10-07T18:00:00.000Z' });
    const exported = JSON.parse(readFileSync(exportPath, 'utf8')) as BenchRunResult;
    const route = await routeOutput({ ...exported, nonce: issueNonce() });
    expect(route.fileText).toBe(result.fileText);
    expect(route.entry.path).toBe(result.path);
  }, 120_000);

  it('refuses a tampered export and writes nothing', async () => {
    const exported = JSON.parse(readFileSync(exportPath, 'utf8')) as BenchRunResult;
    // A device that looks stronger than the one that ran: one more core.
    exported.environment.hardware.cores = (exported.environment.hardware.cores ?? 4) + 1;
    writeFileSync(exportPath, JSON.stringify(exported));
    const indexText = readText('index/summary.json');
    const out = cli();
    expect(out.status).toBe(1);
    expect(out.stderr).toContain('the submit route would refuse this file (400 digest-mismatch): Result digest is missing or wrong.');
    expect(existsSync(join(dataset, RUN_PATH))).toBe(false);
    expect(readText('index/summary.json')).toBe(indexText);
  }, 120_000);

  it('refuses a run id the dataset already holds, in the index or as a run file', async () => {
    const indexText = readText('index/summary.json');
    const run = JSON.parse(readFileSync(exportPath, 'utf8')) as BenchRunResult;
    // A run id the dataset already has (the run the export was made from).
    run.runId = 'study-run-approve-1';
    run.digest = await computeRunDigest(run);
    writeFileSync(exportPath, JSON.stringify(run));
    await expect(importExportedRun({ datasetDir: dataset, file: exportPath })).rejects.toThrow(
      new ImportRunError('run study-run-approve-1 is already in the dataset: runs/2026/10/study-run-approve-1.json'),
    );
    // The index alone lists it (its run file was removed): still refused.
    rmSync(join(dataset, 'runs/2026/10/study-run-approve-1.json'));
    await expect(importExportedRun({ datasetDir: dataset, file: exportPath })).rejects.toThrow(
      'run study-run-approve-1 is already in index/summary.json',
    );
    expect(readText('index/summary.json')).toBe(indexText);
    // Importing the same export twice: the second time is refused.
    run.runId = RUN_ID;
    run.digest = await computeRunDigest(run);
    writeFileSync(exportPath, JSON.stringify(run));
    expect(cli().status).toBe(0);
    const again = cli();
    expect(again.status).toBe(1);
    expect(again.stderr).toContain(`run ${RUN_ID} is already in the dataset: ${RUN_PATH}`);
  }, 120_000);

  it('--dry-run prints what it would write and writes nothing', () => {
    const indexText = readText('index/summary.json');
    const out = cli('--dry-run');
    expect(out.stderr).toBe('');
    expect(out.status).toBe(0);
    expect(out.stdout).toContain(`run file: ${RUN_PATH}`);
    expect(out.stdout).toContain('"importedAt"');
    expect(out.stdout).toContain('dry run: nothing written');
    expect(existsSync(join(dataset, RUN_PATH))).toBe(false);
    expect(readText('index/summary.json')).toBe(indexText);
  }, 120_000);
});
