/**
 * The bench's own IndexedDB database on /bench/run (`localmode-bench-progress`),
 * shared by the crash-recovery store (`attempts`, see partial-run-store.ts) and
 * the saved-exports store (`finished-runs`, see saved-exports.ts). Version 1
 * held only `attempts`; version 2 adds `finished-runs`. The upgrade only
 * creates the stores that are missing, so records written under version 1 are
 * kept as they are.
 */

/** Database name (never deleted by Clear model caches). */
export const BENCH_PROGRESS_DB_NAME = 'localmode-bench-progress';

/** Current schema version: 1 = `attempts`; 2 = `attempts` + `finished-runs`. */
export const BENCH_PROGRESS_DB_VERSION = 2;

/** Object store of unfinished attempts, keyed by `attemptId`. */
export const ATTEMPTS_STORE = 'attempts';

/** Object store of finished runs kept for export, keyed by `runId`. */
export const FINISHED_RUNS_STORE = 'finished-runs';

/** True where the page can use IndexedDB. */
export function hasIndexedDB(): boolean {
  return typeof indexedDB !== 'undefined';
}

/** Open (and, from an older version, upgrade) the database. */
export function openBenchProgressDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BENCH_PROGRESS_DB_NAME, BENCH_PROGRESS_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ATTEMPTS_STORE)) db.createObjectStore(ATTEMPTS_STORE, { keyPath: 'attemptId' });
      if (!db.objectStoreNames.contains(FINISHED_RUNS_STORE)) db.createObjectStore(FINISHED_RUNS_STORE, { keyPath: 'runId' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another tab opening a newer version must not be blocked by this connection.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
    req.onblocked = () => reject(new Error('indexedDB open blocked'));
  });
}

/** Run one request in its own transaction on `storeName`; the connection closes when the transaction ends. */
export function inStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openBenchProgressDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        let t: IDBTransaction;
        try {
          t = db.transaction(storeName, mode);
        } catch (error) {
          db.close();
          reject(error);
          return;
        }
        let result: T;
        const req = work(t.objectStore(storeName));
        req.onsuccess = () => {
          result = req.result;
        };
        req.onerror = () => reject(req.error ?? new Error('indexedDB request failed'));
        // Resolve on commit, so a caller that awaits a write knows it is on disk.
        t.oncomplete = () => {
          db.close();
          resolve(result);
        };
        t.onabort = () => {
          db.close();
          reject(t.error ?? new Error('indexedDB transaction aborted'));
        };
      }),
  );
}
