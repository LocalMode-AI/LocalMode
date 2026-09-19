/**
 * Crash-resilient progress store for a benchmark attempt. A Standard or
 * Thorough suite can push a browser tab past its memory ceiling, and a tab
 * that dies leaves nothing behind: no run file, no error cell, no memory
 * sample, only "it crashed sometimes" (a Dell XPS lab session lost every
 * long run this way). The runner therefore writes the environment capture and
 * every finished cell to IndexedDB as it goes; a later page load finds the
 * unfinished attempt and offers it for export. Partial attempts are never
 * submitted, only exported for diagnosis.
 */

import type {
  BenchCellResult,
  BenchSuiteId,
  EnvironmentCapture,
  HarnessInfo,
} from '@localmode/bench';
import { BENCH_PROTOCOL_VERSION, BENCH_SCHEMA_VERSION } from '@localmode/bench';

const DB_NAME = 'localmode-bench-progress';
const STORE = 'attempts';
const DB_VERSION = 1;

/** One in-progress (or abandoned) benchmark attempt. */
export interface PartialAttempt {
  attemptId: string;
  startedAt: string;
  updatedAt: string;
  suite: BenchSuiteId;
  harness: HarnessInfo;
  /** Every cell the run planned, in execution order. */
  plannedCellIds: string[];
  environment?: EnvironmentCapture;
  /** Finished cells so far (ok, invalid, error, or skipped). */
  cells: BenchCellResult[];
  /** The cell that had started when the record was last updated, if any. */
  currentCellId?: string;
  pageOrigin?: string;
}

function hasIndexedDB(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'attemptId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
    req.onblocked = () => reject(new Error('indexedDB open blocked'));
  });
}

function tx<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = work(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('indexedDB request failed'));
        t.oncomplete = () => db.close();
        t.onabort = () => {
          db.close();
          reject(t.error ?? new Error('indexedDB transaction aborted'));
        };
      }),
  );
}

/** Start tracking an attempt. Returns null where IndexedDB is unavailable (progress is then not persisted). */
export async function beginAttempt(meta: {
  suite: BenchSuiteId;
  harness: HarnessInfo;
  plannedCellIds: string[];
}): Promise<PartialAttempt | null> {
  if (!hasIndexedDB()) return null;
  const now = new Date().toISOString();
  const attempt: PartialAttempt = {
    attemptId: crypto.randomUUID(),
    startedAt: now,
    updatedAt: now,
    suite: meta.suite,
    harness: meta.harness,
    plannedCellIds: meta.plannedCellIds,
    cells: [],
    pageOrigin: typeof location !== 'undefined' ? location.origin : undefined,
  };
  try {
    await tx('readwrite', (s) => s.put(attempt));
    return attempt;
  } catch {
    return null;
  }
}

/** Persist a change to the attempt; failures are swallowed so the run itself is never affected. */
export async function updateAttempt(attempt: PartialAttempt, patch: Partial<PartialAttempt>): Promise<void> {
  Object.assign(attempt, patch, { updatedAt: new Date().toISOString() });
  try {
    await tx('readwrite', (s) => s.put(attempt));
  } catch {
    // Persisting progress is best effort.
  }
}

/** Remove an attempt (run completed, cancelled, failed in-page, or the user discarded it). */
export async function finishAttempt(attemptId: string): Promise<void> {
  if (!hasIndexedDB()) return;
  try {
    await tx('readwrite', (s) => s.delete(attemptId));
  } catch {
    // Nothing to do; a stale record only shows up as a recoverable attempt.
  }
}

/** Attempts left behind by pages that did not finish (crash, closed tab, navigation). */
export async function listUnfinishedAttempts(): Promise<PartialAttempt[]> {
  if (!hasIndexedDB()) return [];
  try {
    const all = await tx<PartialAttempt[]>('readonly', (s) => s.getAll() as IDBRequest<PartialAttempt[]>);
    return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  } catch {
    return [];
  }
}

/**
 * The exportable form of a partial attempt: the same top-level shape as a run
 * file where the data exists, marked `partial: true`, plus the list of cells
 * that never finished so the reader can see where the page died.
 */
export function toPartialRunExport(attempt: PartialAttempt): Record<string, unknown> {
  const finished = new Set(attempt.cells.map((c) => c.cellId));
  return {
    partial: true,
    protocol: BENCH_PROTOCOL_VERSION,
    schemaVersion: BENCH_SCHEMA_VERSION,
    attemptId: attempt.attemptId,
    startedAt: attempt.startedAt,
    lastUpdatedAt: attempt.updatedAt,
    harness: attempt.harness,
    suite: attempt.suite,
    pageOrigin: attempt.pageOrigin,
    environment: attempt.environment ?? null,
    plannedCells: attempt.plannedCellIds.length,
    finishedCells: attempt.cells.length,
    currentCellId: attempt.currentCellId ?? null,
    unfinishedCellIds: attempt.plannedCellIds.filter((id) => !finished.has(id)),
    cells: attempt.cells,
  };
}
