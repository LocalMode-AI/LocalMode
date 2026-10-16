/**
 * Saved exports (`finished-runs` in the bench's IndexedDB database), run
 * through the real store module over fake-indexeddb, a spec-compliant
 * IndexedDB in Node: a finished run is committed BEFORE its download is
 * handed to the browser, the record survives a page reload (a fresh module
 * instance and fresh connections over the same database), a version-1
 * database keeps its unfinished attempts through the upgrade, records list
 * newest first, Remove deletes exactly one, nothing is pruned by default,
 * the stored text is byte for byte the Export JSON file (and the collect
 * tool files it), and the Download all archive holds the same bytes.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeRunDigest, createHarnessControl, type BenchRunResult } from '@localmode/bench';
import { collectControlRuns } from './collect-control-runs';
import { readStoredZip } from './_zip-reader';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, '__fixtures__', 'study-dataset');
const SOURCE_RUN = 'runs/2026/10/study-run-firefox.json';

type Store = typeof import('../src/lib/bench/saved-exports');
type Attempts = typeof import('../src/lib/bench/partial-run-store');

/** A fresh page: new module instances over the same IndexedDB. */
async function loadPage(): Promise<{ store: Store; attempts: Attempts }> {
  vi.resetModules();
  return {
    store: await import('../src/lib/bench/saved-exports'),
    attempts: await import('../src/lib/bench/partial-run-store'),
  };
}

/** The run a control series page finishes with: a fixture run with a new id, the control record, a series place and a digest. */
async function controlRun(runId: string, createdAt: string, index = 1): Promise<BenchRunResult> {
  const run = JSON.parse(readFileSync(join(FIXTURE, SOURCE_RUN), 'utf8')) as BenchRunResult;
  run.runId = runId;
  run.createdAt = createdAt;
  run.harness = {
    ...run.harness,
    control: createHarnessControl('order-reversed'),
    series: { id: 'series-x', index, count: 2, cooldownMs: 0 },
  };
  delete run.nonce;
  run.digest = await computeRunDigest(run);
  return run;
}

/** Read every record of a store with raw IndexedDB calls (not the module under test). */
function rawGetAll(storeName: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('localmode-bench-progress');
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        resolve([]);
        return;
      }
      const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      req.onsuccess = () => {
        db.close();
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
    };
    open.onerror = () => reject(open.error);
  });
}

beforeEach(() => {
  // A clean browser profile per test.
  globalThis.indexedDB = new IDBFactory();
});

describe('saved exports store', () => {
  it('commits the run before the download is handed over, and downloads the stored text', async () => {
    const { store } = await loadPage();
    const run = await controlRun('run-aaaa-0001', '2026-10-15T09:00:00.000Z');
    const seen: Array<{ text: string; fileName: string; storedAtDownload: unknown[] }> = [];
    // The download callback runs synchronously, so read what is on disk at that moment.
    let pendingRead: Promise<unknown[]> | null = null;
    const saved = await store.persistThenDownload(run, 'series', (text, fileName) => {
      pendingRead = rawGetAll('finished-runs');
      seen.push({ text, fileName, storedAtDownload: [] });
    });
    seen[0].storedAtDownload = await pendingRead!;
    expect(saved).not.toBeNull();
    expect(seen).toHaveLength(1);
    expect(seen[0].fileName).toBe('localmode-bench-run-aaaa-0001.json');
    expect(seen[0].text).toBe(JSON.stringify(run, null, 2));
    expect(seen[0].storedAtDownload).toHaveLength(1);
    expect((seen[0].storedAtDownload[0] as { json: string }).json).toBe(seen[0].text);
    const [meta] = await store.listSavedExports();
    expect(meta).toMatchObject({
      runId: 'run-aaaa-0001',
      suite: 'quick',
      controlKind: 'order-reversed',
      series: { id: 'series-x', index: 1, count: 2 },
      finishedAt: '2026-10-15T09:00:00.000Z',
      reason: 'series',
      sizeBytes: Buffer.byteLength(seen[0].text, 'utf8'),
    });
    expect(typeof meta.exportedAt).toBe('string');
    expect('json' in meta).toBe(false);
  });

  it('keeps the record when the download throws (a blocked or failed download loses nothing)', async () => {
    const { store } = await loadPage();
    const run = await controlRun('run-blocked', '2026-10-15T09:00:00.000Z');
    await expect(
      store.persistThenDownload(run, 'series', () => {
        throw new Error('download refused');
      }),
    ).rejects.toThrow('download refused');
    const after = await (await loadPage()).store.getSavedExport('run-blocked');
    expect(after?.json).toBe(JSON.stringify(run, null, 2));
    expect(after?.exportedAt).toBeUndefined();
  });

  it('survives a reload, lists newest first, and saving twice keeps the first record', async () => {
    const first = await loadPage();
    const runA = await controlRun('run-a', '2026-10-15T09:00:00.000Z', 1);
    const runB = await controlRun('run-b', '2026-10-15T09:10:00.000Z', 2);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-15T09:01:00.000Z'));
      await first.store.saveFinishedRun(runA, 'series');
      vi.setSystemTime(new Date('2026-10-15T09:11:00.000Z'));
      await first.store.saveFinishedRun(runB, 'series');
      vi.setSystemTime(new Date('2026-10-15T09:12:00.000Z'));
      const again = await first.store.saveFinishedRun({ ...runA, suite: 'standard' } as BenchRunResult, 'control');
      expect(again?.reason).toBe('series');
      expect(again?.savedAt).toBe('2026-10-15T09:01:00.000Z');
    } finally {
      vi.useRealTimers();
    }
    const reloaded = await loadPage();
    const list = await reloaded.store.listSavedExports();
    expect(list.map((r) => r.runId)).toEqual(['run-b', 'run-a']);
    const withFiles = await reloaded.store.listSavedExportsWithFiles();
    expect(withFiles.map((r) => r.json)).toEqual([JSON.stringify(runB, null, 2), JSON.stringify(runA, null, 2)]);
  });

  it('sorts records saved in the same millisecond by series index, later first', async () => {
    const { store } = await loadPage();
    const base = { suite: 'quick', finishedAt: 'x', reason: 'series' as const, fileName: 'f', sizeBytes: 1 };
    const t = '2026-10-15T09:00:00.000Z';
    const sorted = store.sortSavedExports([
      { ...base, runId: 'r1', savedAt: t, series: { id: 's', index: 1, count: 3 } },
      { ...base, runId: 'r3', savedAt: t, series: { id: 's', index: 3, count: 3 } },
      { ...base, runId: 'r2', savedAt: t, series: { id: 's', index: 2, count: 3 } },
      { ...base, runId: 'later', savedAt: '2026-10-15T10:00:00.000Z' },
    ]);
    expect(sorted.map((r) => r.runId)).toEqual(['later', 'r3', 'r2', 'r1']);
  });

  it('removes exactly the run asked for', async () => {
    const { store } = await loadPage();
    await store.saveFinishedRun(await controlRun('keep-me', '2026-10-15T09:00:00.000Z'), 'control');
    await store.saveFinishedRun(await controlRun('drop-me', '2026-10-15T09:05:00.000Z'), 'control');
    await store.removeSavedExport('drop-me');
    const reloaded = await loadPage();
    expect((await reloaded.store.listSavedExports()).map((r) => r.runId)).toEqual(['keep-me']);
    expect(await rawGetAll('finished-runs')).toHaveLength(1);
  });

  it('never prunes by default; an explicit age removes only older records', async () => {
    const { store } = await loadPage();
    expect(store.SAVED_EXPORT_MAX_AGE_DAYS).toBeNull();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
      await store.saveFinishedRun(await controlRun('old-run', '2025-01-01T00:00:00.000Z'), 'control');
      vi.setSystemTime(new Date('2026-10-15T00:00:00.000Z'));
      await store.saveFinishedRun(await controlRun('new-run', '2026-10-15T00:00:00.000Z'), 'control');
    } finally {
      vi.useRealTimers();
    }
    expect(await store.pruneSavedExports()).toEqual([]);
    expect(await store.listSavedExports()).toHaveLength(2);
    expect(await store.pruneSavedExports(30, new Date('2026-10-15T00:00:00.000Z'))).toEqual(['old-run']);
    expect((await store.listSavedExports()).map((r) => r.runId)).toEqual(['new-run']);
  });

  it('upgrades a version-1 database without touching its unfinished attempts', async () => {
    // A database written by the page before saved exports existed: version 1, `attempts` only.
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('localmode-bench-progress', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('attempts', { keyPath: 'attemptId' });
      open.onsuccess = () => {
        const db = open.result;
        const t = db.transaction('attempts', 'readwrite');
        t.objectStore('attempts').put({
          attemptId: 'old-attempt',
          startedAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:01:00.000Z',
          suite: 'quick',
          harness: { name: '@localmode/bench', version: '0.9.6' },
          plannedCellIds: ['a'],
          cells: [],
        });
        t.oncomplete = () => {
          db.close();
          resolve();
        };
        t.onerror = () => reject(t.error);
      };
      open.onerror = () => reject(open.error);
    });
    const { store, attempts } = await loadPage();
    expect(await store.listSavedExports()).toEqual([]);
    await store.saveFinishedRun(await controlRun('after-upgrade', '2026-10-15T09:00:00.000Z'), 'control');
    expect((await attempts.listUnfinishedAttempts()).map((a) => a.attemptId)).toEqual(['old-attempt']);
    expect((await store.listSavedExports()).map((r) => r.runId)).toEqual(['after-upgrade']);
    const version = await new Promise<number>((resolve) => {
      const open = indexedDB.open('localmode-bench-progress');
      open.onsuccess = () => {
        resolve(open.result.version);
        open.result.close();
      };
    });
    expect(version).toBe(2);
  });

  it('returns null without IndexedDB (the run is then only downloaded)', async () => {
    const saved = globalThis.indexedDB;
    // @ts-expect-error simulate a browser without IndexedDB
    delete globalThis.indexedDB;
    try {
      const { store } = await loadPage();
      const run = await controlRun('no-idb', '2026-10-15T09:00:00.000Z');
      const texts: string[] = [];
      expect(await store.persistThenDownload(run, 'series', (t) => texts.push(t))).toBeNull();
      expect(texts).toEqual([JSON.stringify(run, null, 2)]);
      expect(await store.listSavedExports()).toEqual([]);
    } finally {
      globalThis.indexedDB = saved;
    }
  });
});

describe('a saved export is the Export JSON file', () => {
  let dataset: string;
  let exportsDir: string;
  beforeEach(() => {
    dataset = mkdtempSync(join(tmpdir(), 'bench-saved-dataset-'));
    cpSync(FIXTURE, dataset, { recursive: true });
    exportsDir = mkdtempSync(join(tmpdir(), 'bench-saved-exports-'));
  });
  afterEach(() => {
    rmSync(dataset, { recursive: true, force: true });
    rmSync(exportsDir, { recursive: true, force: true });
  });

  it('the collect tool files the stored text and the archive entries as they are', async () => {
    const { store } = await loadPage();
    const runA = await controlRun('saved-run-a', '2026-10-15T09:00:00.000Z', 1);
    const runB = await controlRun('saved-run-b', '2026-10-15T09:10:00.000Z', 2);
    await store.saveFinishedRun(runA, 'series');
    await store.saveFinishedRun(runB, 'series');
    const records = await store.listSavedExportsWithFiles();

    // Download all: one stored archive, one entry per saved run, same names, same bytes.
    const entries = readStoredZip(store.savedExportsArchive(records));
    expect(entries.map((e) => e.name).sort()).toEqual(['localmode-bench-saved-run-a.json', 'localmode-bench-saved-run-b.json']);
    for (const e of entries) {
      const record = records.find((r) => r.fileName === e.name)!;
      expect(e.data.equals(Buffer.from(record.json, 'utf8'))).toBe(true);
    }
    // The bytes Export JSON (and the series' download) save for the same run.
    expect(entries.find((e) => e.name.endsWith('saved-run-a.json'))!.data.toString('utf8')).toBe(JSON.stringify(runA, null, 2));

    const files = entries.map((e) => {
      const p = join(exportsDir, e.name);
      writeFileSync(p, e.data);
      return p;
    });
    const result = await collectControlRuns({ datasetDir: dataset, files, dryRun: true });
    expect(result.collected.map((c) => c.runId).sort()).toEqual(['saved-run-a', 'saved-run-b']);
  });
});

describe('stored zip writer', () => {
  it('writes entries an independent reader accepts, CRCs checked by zlib', async () => {
    const { createStoredZip, crc32 } = await import('../src/lib/bench/stored-zip');
    const enc = new TextEncoder();
    const files = [
      { name: 'a.json', data: enc.encode('{\n  "a": 1\n}'), modified: new Date('2026-10-15T09:00:00Z') },
      { name: 'ü-b.json', data: enc.encode('x'.repeat(70_000)), modified: new Date('2026-10-15T09:00:00Z') },
      { name: 'empty.json', data: new Uint8Array(0), modified: new Date('1970-01-01T00:00:00Z') },
    ];
    const zip = createStoredZip(files);
    const entries = readStoredZip(zip);
    expect(entries.map((e) => e.name)).toEqual(['a.json', 'ü-b.json', 'empty.json']);
    entries.forEach((e, i) => expect(e.data.equals(Buffer.from(files[i].data))).toBe(true));
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926);
    expect(() => createStoredZip([files[0], files[0]])).toThrow('Duplicate file name');
  });
});
