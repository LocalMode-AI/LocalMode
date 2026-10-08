/**
 * The index rebuild tool over a fixture dataset directory. The fixture's run
 * files are the files the real submit route committed (only the GitHub
 * boundary is stubbed), so the test witnesses that a rebuilt entry is the
 * entry the submit path wrote for the same run. The CLI is run as a real
 * process for the write and refusal paths.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { computeRunDigest, type BenchRunResult } from '@localmode/bench';
import { makeRun } from '../../../packages/bench/tests/helpers';
import { issueNonce } from '../src/lib/bench/nonce';
import type { RunIndexEntry } from '../src/lib/bench/store';
import { buildIndexFromDataset, checkRebuildAgainst, INDEX_FILE, serializeIndex } from './rebuild-bench-index';
import { importExportedRun } from './import-exported-run';

const here = dirname(fileURLToPath(import.meta.url));
const TSX = join(here, '..', 'node_modules', '.bin', 'tsx');
const SCRIPT = join(here, 'rebuild-bench-index.ts');

const committed = new Map<string, string>();
let indexBody = '[]';

function stubGitHub() {
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
      const body = JSON.parse(String(init.body)) as { content: string };
      committed.set(url.split('/contents/')[1], Buffer.from(body.content, 'base64').toString('utf8'));
      return new Response('{}', { status: 201 });
    }
    return new Response('{}', { status: 404 });
  });
}

async function submit(run: BenchRunResult): Promise<number> {
  const { POST } = await import('../src/app/api/bench/submit/route');
  const req = new NextRequest('https://localmode.ai/api/bench/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${Math.floor(Math.random() * 250)}` },
    body: JSON.stringify(run),
  });
  return (await POST(req)).status;
}

async function freshRun(runId: string, createdAt: string): Promise<BenchRunResult> {
  const run = makeRun({ nonce: issueNonce(), runId, createdAt });
  run.digest = await computeRunDigest(run);
  return run;
}

let dataset: string;

function writeDatasetFile(path: string, text: string) {
  mkdirSync(dirname(join(dataset, path)), { recursive: true });
  writeFileSync(join(dataset, path), text);
}

function cli(...args: string[]) {
  return spawnSync(TSX, [SCRIPT, '--dataset', dataset, ...args], { encoding: 'utf8', timeout: 60_000 });
}

describe('rebuild-bench-index', () => {
  beforeEach(() => {
    process.env.BENCH_GITHUB_REPO = 'example/bench-data';
    process.env.BENCH_GITHUB_TOKEN = 'test-token';
    process.env.BENCH_NONCE_SECRET = 'unit-test-secret';
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.KV_REST_API_URL;
    committed.clear();
    indexBody = '[]';
    stubGitHub();
    dataset = mkdtempSync(join(tmpdir(), 'bench-dataset-'));
    mkdirSync(join(dataset, 'runs'), { recursive: true });
    writeFileSync(join(dataset, 'runs', '.gitkeep'), '');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(dataset, { recursive: true, force: true });
  });

  it('rebuilds the exact bytes the submit route wrote, from the committed run files', async () => {
    expect(await submit(await freshRun('fixture-run-a', '2026-09-24T06:00:00.000Z'))).toBe(200);
    expect(await submit(await freshRun('fixture-run-b', '2026-09-25T06:00:00.000Z'))).toBe(200);
    expect(committed.size).toBe(2);
    for (const [path, text] of committed) writeDatasetFile(path, text);

    const { entries, problems } = buildIndexFromDataset(dataset);
    expect(problems).toEqual([]);
    expect(serializeIndex(entries)).toBe(indexBody);
    const written = JSON.parse(indexBody) as RunIndexEntry[];
    expect(written.map((e) => e.runId)).toEqual(['fixture-run-a', 'fixture-run-b']);
    // The fields the submit path derives are all present on the rebuilt entry.
    expect(entries[0].protocol).toBe('localmode-bench/5');
    expect(typeof entries[0].deviceSubclass).toBe('string');
    expect(typeof entries[0].harnessVersion).toBe('string');
    expect(entries[0].cells.length).toBeGreaterThan(0);
  });

  it('keeps importedAt from the current index: a rebuild after an import changes no byte', async () => {
    expect(await submit(await freshRun('fixture-run-a', '2026-09-24T06:00:00.000Z'))).toBe(200);
    for (const [path, text] of committed) writeDatasetFile(path, text);
    writeDatasetFile(INDEX_FILE, indexBody);
    // A second run whose upload never went through, added from its exported file.
    const exported = makeRun({ nonce: issueNonce(Date.now() - 30 * 3600_000), runId: 'fixture-run-b', createdAt: '2026-09-25T06:00:00.000Z' });
    exported.digest = await computeRunDigest(exported);
    const exportFile = join(dataset, 'export-b.json');
    writeFileSync(exportFile, JSON.stringify(exported));
    await importExportedRun({ datasetDir: dataset, file: exportFile, now: new Date('2026-10-07T12:00:00.000Z') });
    rmSync(exportFile);
    const afterImport = readFileSync(join(dataset, INDEX_FILE), 'utf8');
    const imported = (JSON.parse(afterImport) as RunIndexEntry[]).map((e) => [e.runId, e.importedAt]);
    expect(imported).toEqual([
      ['fixture-run-a', undefined],
      ['fixture-run-b', '2026-10-07T12:00:00.000Z'],
    ]);

    const ok = cli();
    expect(ok.status, ok.stderr).toBe(0);
    expect(readFileSync(join(dataset, INDEX_FILE), 'utf8')).toBe(afterImport);
    // Without the current index, the same run files give the entries without the mark.
    const bare = buildIndexFromDataset(dataset).entries;
    expect(bare.every((e) => !('importedAt' in e))).toBe(true);
    expect(serializeIndex(bare)).not.toBe(afterImport);
  }, 120_000);

  it('orders by createdAt then path, marks quarantine/ runs flagged, and ignores non-JSON files', async () => {
    writeDatasetFile('runs/2026/09/fixture-z-late.json', JSON.stringify(await freshRun('fixture-z-late', '2026-09-27T00:00:00.000Z')));
    writeDatasetFile('runs/2026/09/fixture-b-tie.json', JSON.stringify(await freshRun('fixture-b-tie', '2026-09-26T00:00:00.000Z')));
    writeDatasetFile('runs/2026/08/fixture-a-tie.json', JSON.stringify(await freshRun('fixture-a-tie', '2026-09-26T00:00:00.000Z')));
    writeDatasetFile('quarantine/2026/09/fixture-q-early.json', JSON.stringify(await freshRun('fixture-q-early', '2026-09-01T00:00:00.000Z')));
    writeDatasetFile('quarantine/.gitkeep', '');

    const first = buildIndexFromDataset(dataset);
    expect(first.problems).toEqual([]);
    expect(first.entries.map((e) => [e.runId, e.flagged, e.path])).toEqual([
      ['fixture-q-early', true, 'quarantine/2026/09/fixture-q-early.json'],
      ['fixture-a-tie', false, 'runs/2026/08/fixture-a-tie.json'],
      ['fixture-b-tie', false, 'runs/2026/09/fixture-b-tie.json'],
      ['fixture-z-late', false, 'runs/2026/09/fixture-z-late.json'],
    ]);
    expect(serializeIndex(buildIndexFromDataset(dataset).entries)).toBe(serializeIndex(first.entries));
  });

  it('reports run files it cannot index instead of skipping them silently', async () => {
    writeDatasetFile('runs/2026/09/fixture-ok.json', JSON.stringify(await freshRun('fixture-ok', '2026-09-24T00:00:00.000Z')));
    writeDatasetFile('runs/2026/09/broken.json', '{"runId":');
    writeDatasetFile('runs/2026/09/not-a-run.json', '{"runId":"x"}');
    writeDatasetFile('runs/2026/09/dup.json', JSON.stringify(await freshRun('fixture-ok', '2026-09-24T00:00:00.000Z')));
    const { entries, problems } = buildIndexFromDataset(dataset);
    expect(entries.map((e) => e.runId)).toEqual(['fixture-ok']);
    expect(problems.map((p) => p.path).sort()).toEqual([
      'runs/2026/09/broken.json',
      'runs/2026/09/fixture-ok.json',
      'runs/2026/09/not-a-run.json',
    ]);
    expect(problems.find((p) => p.path === 'runs/2026/09/fixture-ok.json')!.reason).toContain('dup.json');
  });

  it('refuses a rebuild that drops entries unless --allow-shrink is set', () => {
    const e = (runId: string) => ({ runId }) as RunIndexEntry;
    expect(() => checkRebuildAgainst([e('a'), e('b')], [e('a')])).toThrow(/2.*1/);
    // Same count but a different run: still a loss.
    expect(() => checkRebuildAgainst([e('a'), e('b')], [e('a'), e('c')])).toThrow();
    expect(() => checkRebuildAgainst([e('a'), e('b')], [e('a'), e('b'), e('c')])).not.toThrow();
    expect(() => checkRebuildAgainst([e('a'), e('b')], [e('a')], true)).not.toThrow();
  });

  it('the CLI writes the rebuilt index, and refuses to shrink it without --allow-shrink', async () => {
    writeDatasetFile('runs/2026/09/fixture-one.json', JSON.stringify(await freshRun('fixture-one', '2026-09-24T00:00:00.000Z')));
    const truncated = JSON.stringify([{ runId: 'fixture-one' }]);
    writeDatasetFile(INDEX_FILE, truncated);

    const ok = cli();
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toContain('1 entries (1 verified, 0 flagged); current index has 1');
    const rebuilt = readFileSync(join(dataset, INDEX_FILE), 'utf8');
    expect(rebuilt).toBe(serializeIndex(buildIndexFromDataset(dataset).entries));

    // A run file disappears: the CLI keeps the index as it is.
    rmSync(join(dataset, 'runs/2026/09/fixture-one.json'));
    const refused = cli();
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('refusing to replace an index of 1 entries with one of 0');
    expect(readFileSync(join(dataset, INDEX_FILE), 'utf8')).toBe(rebuilt);

    const forced = cli('--allow-shrink');
    expect(forced.status, forced.stderr).toBe(0);
    expect(readFileSync(join(dataset, INDEX_FILE), 'utf8')).toBe('[]');
  }, 120_000);
});
