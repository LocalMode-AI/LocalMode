// @vitest-environment jsdom
/**
 * The Saved exports panel on /bench/run, rendered with React 19 in jsdom over
 * the real store module and fake-indexeddb (the IndexedDB boundary). The
 * owner mirrors the runner: it lists the store and reloads the list when the
 * panel reports a change. The download boundary (`URL.createObjectURL` +
 * the anchor's `click()`) is captured so the saved files can be read back:
 * nothing is downloaded before a click, one click on Download all saves ONE
 * archive (one download per user click, which Chrome allows), and its
 * entries are byte for byte the stored files.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement, useCallback, useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeRunDigest, createHarnessControl, type BenchRunResult } from '@localmode/bench';
import { click, mount, type Mounted } from './_equivalence-dom';
import { readStoredZip } from './_zip-reader';
import { SavedExportsPanel } from '../src/components/bench/saved-exports-panel';
import {
  listSavedExports,
  listSavedExportsWithFiles,
  saveFinishedRun,
  type SavedExportMeta,
} from '../src/lib/bench/saved-exports';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE_RUN = join(here, '__fixtures__', 'study-dataset', 'runs', '2026', '10', 'study-run-firefox.json');

async function controlRun(runId: string, createdAt: string, index: number): Promise<BenchRunResult> {
  const run = JSON.parse(readFileSync(SOURCE_RUN, 'utf8')) as BenchRunResult;
  run.runId = runId;
  run.createdAt = createdAt;
  run.harness = {
    ...run.harness,
    control: createHarnessControl('order-reversed'),
    series: { id: 'series-p', index, count: 2, cooldownMs: 0 },
  };
  delete run.nonce;
  run.digest = await computeRunDigest(run);
  return run;
}

/** The runner's wiring: list the store on mount and after every change. */
function Owner() {
  const [exports, setExports] = useState<SavedExportMeta[]>([]);
  const refresh = useCallback(() => {
    void listSavedExports().then(setExports);
  }, []);
  useEffect(refresh, [refresh]);
  return createElement(SavedExportsPanel, { exports, onChanged: refresh });
}

interface CapturedDownload {
  fileName: string;
  blob: Blob;
}

let downloads: CapturedDownload[];
let blobs: Map<string, Blob>;
let view: Mounted | null = null;

function readBlob(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/** Wait until `check` passes, flushing React between tries (IndexedDB callbacks are macrotasks). */
async function until(check: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 5));
    await view?.flush();
  }
  throw new Error(`timed out waiting for ${what}`);
}

function buttonByName(container: HTMLElement, name: string): HTMLButtonElement {
  const matches = [...container.querySelectorAll('button')].filter(
    (b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === name,
  );
  if (matches.length !== 1) throw new Error(`expected one button "${name}", found ${matches.length}`);
  return matches[0];
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  downloads = [];
  blobs = new Map();
  let n = 0;
  URL.createObjectURL = vi.fn((blob: Blob) => {
    const url = `blob:test/${++n}`;
    blobs.set(url, blob);
    return url;
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ fileName: this.download, blob: blobs.get(this.href)! });
  });
});

afterEach(async () => {
  await view?.unmount();
  view = null;
  vi.restoreAllMocks();
});

describe('Saved exports panel', () => {
  it('renders nothing while the store is empty', async () => {
    view = await mount(createElement(Owner));
    await view.flush();
    expect(view.container.querySelector('[aria-label="Saved exports"]')).toBeNull();
  });

  it('lists each saved run, and Download all saves one archive of the stored bytes from the click', async () => {
    const runA = await controlRun('3f2a9c1e-0000-4000-8000-00000000aaaa', '2026-10-15T09:00:00.000Z', 1);
    const runB = await controlRun('7b44d0e2-0000-4000-8000-00000000bbbb', '2026-10-15T09:20:00.000Z', 2);
    await saveFinishedRun(runA, 'series');
    await new Promise((r) => setTimeout(r, 2));
    await saveFinishedRun(runB, 'series');

    view = await mount(createElement(Owner));
    const c = view.container;
    await until(() => c.querySelectorAll('[aria-label^="Saved run "]').length === 2, 'two listed runs');
    const region = c.querySelector('[role="region"][aria-label="Saved exports"]');
    expect(region).not.toBeNull();
    expect(region!.textContent).toContain('2 finished runs are saved in this browser');
    const items = [...c.querySelectorAll('[aria-label^="Saved run "]')];
    // Newest first, with the short id, suite, control kind, series place, size, and download state.
    expect(items.map((li) => li.getAttribute('aria-label'))).toEqual([`Saved run ${runB.runId}`, `Saved run ${runA.runId}`]);
    expect(items[0].textContent).toContain('7b44d0e2…bbbb');
    expect(items[0].textContent).toContain('quick suite');
    expect(items[0].textContent).toContain('control: order-reversed');
    expect(items[0].textContent).toContain('series run 2 of 2');
    expect(items[0].textContent).toContain('not downloaded yet');
    expect(items[0].textContent).toMatch(/\d+ KB/);

    expect(downloads).toEqual([]);
    await click(buttonByName(c, 'Download all (.zip)'));
    await until(() => c.textContent!.includes('Download started: localmode-bench-saved-exports-'), 'download status');
    expect(downloads).toHaveLength(1);
    expect(downloads[0].fileName).toMatch(/^localmode-bench-saved-exports-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.zip$/);
    expect(downloads[0].blob.type).toBe('application/zip');
    const entries = readStoredZip(await readBlob(downloads[0].blob));
    const stored = await listSavedExportsWithFiles();
    expect(entries.map((e) => e.name).sort()).toEqual(stored.map((r) => r.fileName).sort());
    for (const r of stored) {
      expect(entries.find((e) => e.name === r.fileName)!.data.equals(Buffer.from(r.json, 'utf8'))).toBe(true);
    }
    expect(entries.find((e) => e.name === `localmode-bench-${runA.runId}.json`)!.data.toString('utf8')).toBe(
      JSON.stringify(runA, null, 2),
    );
    // The records now say when their download started; the list shows it.
    expect(stored.every((r) => typeof r.exportedAt === 'string')).toBe(true);
    await until(() => !c.textContent!.includes('not downloaded yet'), 'download time in the list');
  });

  it('per-run Download saves that run file; Remove asks first, Keep cancels, and the confirmed Remove deletes only that run', async () => {
    const runA = await controlRun('run-a', '2026-10-15T09:00:00.000Z', 1);
    const runB = await controlRun('run-b', '2026-10-15T09:20:00.000Z', 2);
    await saveFinishedRun(runA, 'control');
    await new Promise((r) => setTimeout(r, 2));
    await saveFinishedRun(runB, 'control');
    view = await mount(createElement(Owner));
    const c = view.container;
    await until(() => c.querySelectorAll('[aria-label^="Saved run "]').length === 2, 'two listed runs');

    await click(buttonByName(c, 'Download run run-a'));
    await until(() => downloads.length === 1, 'one download');
    expect(downloads[0].fileName).toBe('localmode-bench-run-a.json');
    expect(new TextDecoder().decode(await readBlob(downloads[0].blob))).toBe(JSON.stringify(runA, null, 2));

    await click(buttonByName(c, 'Remove run run-b'));
    expect(c.querySelector('[role="group"][aria-label="Confirm removing run run-b"]')).not.toBeNull();
    await click(buttonByName(c, 'Keep run run-b'));
    expect(c.querySelector('[role="group"][aria-label="Confirm removing run run-b"]')).toBeNull();
    expect((await listSavedExports()).map((r) => r.runId)).toEqual(['run-b', 'run-a']);

    await click(buttonByName(c, 'Remove run run-b'));
    await click(buttonByName(c, 'Remove run run-b for good'));
    await until(() => c.querySelectorAll('[aria-label^="Saved run "]').length === 1, 'one listed run');
    expect((await listSavedExports()).map((r) => r.runId)).toEqual(['run-a']);

    await click(buttonByName(c, 'Remove run run-a'));
    await click(buttonByName(c, 'Remove run run-a for good'));
    await until(() => c.querySelector('[aria-label="Saved exports"]') === null, 'the panel to disappear');
    expect(downloads).toHaveLength(1);
  });
});
