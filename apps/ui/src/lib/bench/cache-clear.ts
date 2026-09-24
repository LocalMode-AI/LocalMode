/**
 * "Clear model caches" for /bench/run: delete every model artifact the page's
 * providers keep for this origin, so the next run loads its models cold.
 *
 * Where each provider keeps its files:
 * - Transformers.js: Cache API `transformers-cache` (its resilient cache and
 *   `clearModelCache()` use the same name).
 * - WebLLM: Cache API `webllm/model`, `webllm/config`, `webllm/wasm`, or
 *   IndexedDB databases of the same names when its IndexedDB backend is on.
 * - wllama: the Origin Private File System directory `cache`, cleared through
 *   the provider's own `clearAllModelCache()`, with a direct removal as the
 *   fallback.
 * - LiteRT: Cache API `litert-models` (`@litert-lm/core` keeps no store of
 *   its own; the provider caches the `.litertlm` file).
 * - MediaPipe: nothing: its model and WASM files are fetched on every load and
 *   live only in the browser's HTTP disk cache, which no page can clear.
 * - Chrome Built-in AI: Gemini Nano is installed browser-wide by Chrome and
 *   is out of a page's reach.
 *
 * The Cache API caches are deleted by name rather than through the
 * Transformers.js and WebLLM packages: both helpers are the same
 * `caches.delete` call, and importing those packages would load their
 * runtimes into the page just to call it. Nothing else on the origin is
 * touched: not the bench's crash-recovery database, not the service worker's
 * caches, not the runner's localStorage keys.
 */

/** The bench's own crash-recovery database (never deleted here). */
export const BENCH_PROGRESS_DB = 'localmode-bench-progress';

/** wllama's model directory in the Origin Private File System. */
export const WLLAMA_OPFS_DIR = 'cache';

/** localStorage key set after a successful clear and consumed by the next run. */
export const CLEARED_MARKER_KEY = 'localmode-bench-caches-cleared';

const EXACT_CACHE_NAMES = new Set(['transformers-cache', 'litert-models']);
const WEBLLM_PREFIX = 'webllm/';

/** Cache API cache names that belong to the page's model providers, in input order. */
export function selectProviderCacheNames(names: readonly string[]): string[] {
  return names.filter((n) => EXACT_CACHE_NAMES.has(n) || n.startsWith(WEBLLM_PREFIX));
}

/** IndexedDB database names that belong to the page's model providers (WebLLM's IndexedDB backend). */
export function selectProviderIndexedDBNames(names: readonly string[]): string[] {
  return names.filter((n) => n !== BENCH_PROGRESS_DB && n.startsWith(WEBLLM_PREFIX));
}

/** What the providers hold for this origin right now. */
export interface ProviderStorageSnapshot {
  caches: Array<{ name: string; entries: number }>;
  indexedDB: string[];
  /** Model files in wllama's OPFS directory (metadata sidecars excluded). */
  opfs: Array<{ name: string; bytes: number }>;
  /** False where the browser cannot list IndexedDB databases (the WebLLM IndexedDB names are then deleted blind). */
  indexedDBListable?: boolean;
}

/** True when no provider cache holds a file, no provider database exists and wllama's directory has no model. */
export function isProviderStorageEmpty(s: Pick<ProviderStorageSnapshot, 'caches' | 'indexedDB' | 'opfs'>): boolean {
  return s.caches.every((c) => c.entries === 0) && s.indexedDB.length === 0 && s.opfs.length === 0;
}

/** Outcome of one clear. */
export interface CacheClearReport {
  ok: boolean;
  clearedAt: string;
  deleted: Pick<ProviderStorageSnapshot, 'caches' | 'indexedDB' | 'opfs'>;
  /** `navigator.storage.estimate().usage` before and after, where the browser reports it. */
  usageBeforeBytes?: number;
  usageAfterBytes?: number;
  errors: string[];
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

/** Human-readable lines for the report card. */
export function describeClearReport(report: CacheClearReport): string[] {
  const { caches, indexedDB, opfs } = report.deleted;
  const lines = [
    caches.length > 0
      ? `Cache API: ${caches.map((c) => `${c.name} (${c.entries} file${c.entries === 1 ? '' : 's'})`).join(', ')}`
      : 'Cache API: no provider caches found',
    opfs.length > 0
      ? `Origin Private File System (wllama): ${opfs.length} model file${opfs.length === 1 ? '' : 's'}, ${formatSize(
          opfs.reduce((acc, f) => acc + f.bytes, 0),
        )}`
      : 'Origin Private File System (wllama): no model files found',
    indexedDB.length > 0 ? `IndexedDB: ${indexedDB.join(', ')}` : 'IndexedDB: no provider databases found',
  ];
  if (report.usageBeforeBytes !== undefined && report.usageAfterBytes !== undefined) {
    lines.push(
      `Storage used by this site: ${formatSize(report.usageBeforeBytes)} before, ${formatSize(report.usageAfterBytes)} after (${formatSize(
        Math.max(0, report.usageBeforeBytes - report.usageAfterBytes),
      )} freed). The browser can keep counting deleted Cache API space for a while before it reclaims it.`,
    );
  }
  for (const e of report.errors) lines.push(`Error: ${e}`);
  return lines;
}

async function usageBytes(): Promise<number | undefined> {
  try {
    const est = await navigator.storage?.estimate?.();
    return typeof est?.usage === 'number' ? est.usage : undefined;
  } catch {
    return undefined;
  }
}

type DirHandle = FileSystemDirectoryHandle & AsyncIterable<[string, FileSystemHandle]>;

async function wllamaDir(): Promise<DirHandle | null> {
  try {
    if (!navigator.storage?.getDirectory) return null;
    const root = await navigator.storage.getDirectory();
    return (await root.getDirectoryHandle(WLLAMA_OPFS_DIR, { create: false })) as DirHandle;
  } catch {
    return null;
  }
}

/** List what the providers hold for this origin (never creates a store). */
export async function snapshotProviderStorage(): Promise<ProviderStorageSnapshot> {
  const snapshot: ProviderStorageSnapshot = { caches: [], indexedDB: [], opfs: [] };
  if (typeof caches !== 'undefined') {
    try {
      for (const name of selectProviderCacheNames(await caches.keys())) {
        const cache = await caches.open(name);
        snapshot.caches.push({ name, entries: (await cache.keys()).length });
      }
    } catch {
      // Cache API blocked: nothing listable.
    }
  }
  if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
    try {
      const dbs = await indexedDB.databases();
      snapshot.indexedDB = selectProviderIndexedDBNames(dbs.map((d) => d.name ?? '').filter(Boolean));
      snapshot.indexedDBListable = true;
    } catch {
      snapshot.indexedDBListable = false;
    }
  } else {
    snapshot.indexedDBListable = false;
  }
  const dir = await wllamaDir();
  if (dir) {
    try {
      for await (const [name, handle] of dir) {
        if (handle.kind !== 'file' || name.startsWith('__metadata__')) continue;
        const file = await (handle as FileSystemFileHandle).getFile();
        snapshot.opfs.push({ name, bytes: file.size });
      }
    } catch {
      // Directory vanished mid-listing.
    }
  }
  return snapshot;
}

function deleteDatabase(name: string, timeoutMs = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('delete timed out')), timeoutMs);
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => {
      clearTimeout(timer);
      resolve();
    };
    req.onerror = () => {
      clearTimeout(timer);
      reject(req.error ?? new Error('delete failed'));
    };
    req.onblocked = () => {
      clearTimeout(timer);
      reject(new Error('delete blocked by an open connection'));
    };
  });
}

/** WebLLM's IndexedDB names, deleted blind where the browser cannot list databases. */
const WEBLLM_IDB_NAMES = ['webllm/model', 'webllm/config', 'webllm/wasm'];

/**
 * Delete every model artifact the page's providers cached for this origin and
 * report what went. Call only while no run is in progress.
 */
export async function clearProviderModelCaches(): Promise<CacheClearReport> {
  const errors: string[] = [];
  const usageBeforeBytes = await usageBytes();
  const before = await snapshotProviderStorage();

  // wllama through its own API first; remove the directory directly if it survives.
  let wllamaError: string | null = null;
  try {
    const { clearAllModelCache } = await import('@localmode/wllama');
    await clearAllModelCache();
  } catch (error) {
    wllamaError = `wllama clearAllModelCache: ${(error as Error)?.message ?? String(error)}`;
  }
  if (await wllamaDir()) {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(WLLAMA_OPFS_DIR, { recursive: true });
    } catch (error) {
      errors.push(wllamaError ?? `OPFS ${WLLAMA_OPFS_DIR}: ${(error as Error)?.message ?? String(error)}`);
    }
  }

  if (typeof caches !== 'undefined') {
    for (const { name } of before.caches) {
      try {
        await caches.delete(name);
      } catch (error) {
        errors.push(`Cache API ${name}: ${(error as Error)?.message ?? String(error)}`);
      }
    }
  }

  const idbNames = before.indexedDBListable ? before.indexedDB : typeof indexedDB !== 'undefined' ? WEBLLM_IDB_NAMES : [];
  const deletedIdb: string[] = [];
  for (const name of idbNames) {
    try {
      await deleteDatabase(name);
      if (before.indexedDBListable) deletedIdb.push(name);
    } catch (error) {
      errors.push(`IndexedDB ${name}: ${(error as Error)?.message ?? String(error)}`);
    }
  }

  const after = await snapshotProviderStorage();
  if (!isProviderStorageEmpty(after)) {
    const left = [
      ...after.caches.filter((c) => c.entries > 0).map((c) => `Cache API ${c.name}`),
      ...after.indexedDB.map((n) => `IndexedDB ${n}`),
      ...after.opfs.map((f) => `OPFS ${f.name}`),
    ];
    errors.push(`still present after clearing: ${left.join(', ')}`);
  }
  return {
    ok: errors.length === 0,
    clearedAt: new Date().toISOString(),
    deleted: { caches: before.caches, indexedDB: deletedIdb, opfs: before.opfs },
    usageBeforeBytes,
    usageAfterBytes: await usageBytes(),
    errors,
  };
}

/** Remember that the provider caches were just cleared, for the next run's `harness.coldStart`. */
export function markCachesCleared(report: CacheClearReport): void {
  try {
    if (report.ok) localStorage.setItem(CLEARED_MARKER_KEY, report.clearedAt);
    else localStorage.removeItem(CLEARED_MARKER_KEY);
  } catch {
    // Storage blocked: the next run simply does not claim a cold start.
  }
}

/**
 * Consume the cleared marker at the start of a run. True only when a clear
 * happened since the last run AND the provider storage is still empty now
 * (another page of the origin may have cached a model in between).
 */
export async function takeColdStartMarker(): Promise<boolean> {
  let marked = false;
  try {
    marked = localStorage.getItem(CLEARED_MARKER_KEY) !== null;
    localStorage.removeItem(CLEARED_MARKER_KEY);
  } catch {
    return false;
  }
  if (!marked) return false;
  return isProviderStorageEmpty(await snapshotProviderStorage());
}
