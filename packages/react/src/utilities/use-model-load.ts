/**
 * @file use-model-load.ts
 * @description Hook for the provider-model load lifecycle: singleton model
 * creation, cross-provider progress normalization, and a warmup-driven status
 * machine backed by a module-level registry that survives unmount/remount.
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { EmbeddingModel, LanguageModel } from '@localmode/core';

const IS_SERVER = typeof window === 'undefined';

/** Synthetic per-file key used when a provider reports bytes without a file name. */
const SYNTHETIC_FILE = '__model__';

/** Load lifecycle status for a provider model. */
export type ModelLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Union of the progress event shapes emitted by LocalMode providers.
 *
 * - `@localmode/transformers` emits PER-FILE events:
 *   `{ status: 'initiate'|'download'|'progress'|'done'|'ready', file?, progress? (0-100 per file), loaded?, total? }`
 * - `@localmode/webllm` emits aggregated percent events:
 *   `{ status: 'progress'|'done', progress (0-100) }`
 * - `@localmode/wllama` / `@localmode/litert` emit single-file byte events:
 *   `{ status: 'initiate'|'download'|'done'|'ready', loaded, total }`
 *   (litert adds a synthetic `progress: 95` compile phase)
 */
export interface AnyLoadProgress {
  /** Provider status string (e.g. 'initiate', 'download', 'progress', 'done', 'ready') */
  status?: string;

  /** Model name being loaded (transformers) */
  name?: string;

  /** File being downloaded (transformers per-file events) */
  file?: string;

  /** Progress percentage 0-100 (per-file for transformers, aggregate for webllm/wllama/litert) */
  progress?: number;

  /** Bytes loaded */
  loaded?: number;

  /** Total bytes */
  total?: number;

  /** Human-readable step description */
  text?: string;
}

/** Per-file download progress in bytes. */
export interface ModelFileProgress {
  /** Bytes loaded for this file */
  loaded: number;

  /** Total bytes for this file */
  total: number;
}

/** Pre-shaped progress object for download-progress UI components. */
export interface ModelLoadProgressValue {
  /** Total bytes loaded across files (only when byte counts were reported) */
  loaded?: number;

  /** Total bytes across files (only when byte counts were reported) */
  total?: number;

  /** Aggregate completion FRACTION in the 0–1 range — matches the @localmode/ui
   * `DownloadProgressValue.percent` contract (the registry component multiplies
   * by 100 itself). Use `progress` (also 0–1) or multiply for display. */
  percent: number;

  /** Whether the model was already cached when load() started (when known) */
  cached?: boolean;
}

/** Options for the useModelLoad hook */
export interface UseModelLoadOptions<M> {
  /**
   * Singleton/dedup key for the model — typically the modelId. All
   * `useModelLoad` instances (and `useModelStatus` lookups) sharing this key
   * share one registry entry, one model instance, and one load lifecycle.
   */
  key: string;

  /**
   * Factory that constructs the provider model with the registry-bound
   * progress callback. Providers bind `onProgress` at construction, so the
   * hook owns the callback and the factory wires it in, e.g.
   * `(onProgress) => wllama.languageModel(id, { onProgress })`.
   *
   * Invoked AT MOST ONCE per key, and only on the client (never during SSR).
   */
  create: (onProgress: (progress: AnyLoadProgress) => void) => M;

  /**
   * Inference that forces the provider's lazy load to completion. The hook's
   * status machine is driven by this promise: resolve → 'ready', reject →
   * 'error'. Defaults to a feature-detected minimal inference:
   * `doGenerate` → `generateText({ model, prompt: 'Hi', maxTokens: 1 })`;
   * `doEmbed` → `embed({ model, value: '.' })`; anything else throws a
   * descriptive error telling you to pass an explicit `warmup`.
   */
  warmup?: (model: M) => Promise<unknown>;

  /**
   * Provider cache probe (e.g. `() => webllm.isModelCached(id)`).
   * Evaluated once when `load()` starts; result exposed as `cached`.
   */
  isCached?: () => Promise<boolean>;

  /**
   * Start loading automatically on mount (client only).
   * @default false
   */
  autoLoad?: boolean;
}

/** Return type for the useModelLoad hook */
export interface UseModelLoadReturn<M> {
  /** Load lifecycle status — driven by the warmup promise, never by progress events */
  status: ModelLoadStatus;

  /**
   * Aggregate load progress, 0-1. Non-decreasing within a load attempt: when
   * a provider discovers additional files mid-download the raw Σloaded/Σtotal
   * can dip, so the published value is clamped to its high-water mark (reset
   * on each load() attempt). `perFile` carries the raw byte counts.
   */
  progress: number;

  /** Per-file byte progress (keyed by file name, or a synthetic single entry) */
  perFile: ReadonlyMap<string, ModelFileProgress>;

  /** Whether the model was cached when load() started (undefined until probed) */
  cached: boolean | undefined;

  /** Load error (warmup rejection), or null */
  error: Error | null;

  /** The model instance — null until first client use (created in a mount effect) */
  model: M | null;

  /**
   * Start (or join) the load. Idempotent: concurrent calls join the in-flight
   * load; calls after 'ready' resolve immediately; calls after 'error' retry.
   * Rejects with the warmup error on failure (also exposed via `error`).
   *
   * Limitation: not abortable in v1 — provider model loads do not accept an
   * AbortSignal, so an in-flight load cannot be cancelled.
   */
  load: () => Promise<void>;

  /** Pre-shaped progress for download-progress UI components */
  progressValue: ModelLoadProgressValue;
}

/**
 * Snapshot of the model-status view of a registry entry.
 * @internal
 */
export interface ModelStatusSnapshot {
  /** Whether the model finished loading (warmup resolved) */
  isReady: boolean;

  /** Whether a load is in flight */
  isLoading: boolean;

  /** Aggregate load progress, 0-1 */
  progress: number;

  /** Load error, or null */
  error: Error | null;
}

/** Full snapshot of a registry entry as exposed by useModelLoad. */
interface ModelLoadSnapshot {
  status: ModelLoadStatus;
  progress: number;
  perFile: ReadonlyMap<string, ModelFileProgress>;
  cached: boolean | undefined;
  error: Error | null;
  model: unknown;
  progressValue: ModelLoadProgressValue;
}

/** Internal load dependencies (generic erased). */
interface LoadDeps {
  create: (onProgress: (progress: AnyLoadProgress) => void) => unknown;
  warmup?: (model: unknown) => Promise<unknown>;
  isCached?: () => Promise<boolean>;
}

/** A single registry entry — the shared lifecycle state for one key. */
interface RegistryEntry {
  status: ModelLoadStatus;
  fraction: number;
  /**
   * High-water mark of `fraction` within the current load() attempt. The
   * published aggregate (`progress` / `progressValue.percent`) is
   * `max(fraction, maxFraction)` so it never decreases when the Σtotal
   * denominator grows as providers discover additional files mid-download
   * (the raw fraction dips, e.g. 2% → 1%). Reset to 0 at the start of each
   * load() attempt so a retry reports truthful progress. `perFile` and the
   * byte counts stay raw — only the derived aggregate is clamped.
   */
  maxFraction: number;
  perFile: Map<string, ModelFileProgress>;
  cached: boolean | undefined;
  error: Error | null;
  model: unknown;
  modelCreated: boolean;
  loadPromise: Promise<void> | null;
  listeners: Set<() => void>;
  /** Memoized snapshots — useSyncExternalStore requires stable references */
  snapshot: ModelLoadSnapshot | null;
  statusSnapshot: ModelStatusSnapshot | null;
}

/**
 * Module-level registry. Entries are never deleted: model instances are
 * singletons and progress must survive unmount/remount mid-download.
 */
const registry = new Map<string, RegistryEntry>();

/** Stable SSR snapshot — inert: idle, no progress, no model. */
const SERVER_SNAPSHOT: ModelLoadSnapshot = {
  status: 'idle',
  progress: 0,
  perFile: new Map(),
  cached: undefined,
  error: null,
  model: null,
  progressValue: { percent: 0 },
};

/** Stable SSR snapshot for the status view. */
const SERVER_STATUS_SNAPSHOT: ModelStatusSnapshot = {
  isReady: false,
  isLoading: false,
  progress: 0,
  error: null,
};

function getServerSnapshot(): ModelLoadSnapshot {
  return SERVER_SNAPSHOT;
}

/** @internal */
export function getServerModelStatusSnapshot(): ModelStatusSnapshot {
  return SERVER_STATUS_SNAPSHOT;
}

/** Normalize unknown thrown values to Error. */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/** Get or lazily create the registry entry for a key (no side effects beyond insertion). */
function getOrCreateEntry(key: string): RegistryEntry {
  let entry = registry.get(key);
  if (!entry) {
    entry = {
      status: 'idle',
      fraction: 0,
      maxFraction: 0,
      perFile: new Map(),
      cached: undefined,
      error: null,
      model: null,
      modelCreated: false,
      loadPromise: null,
      listeners: new Set(),
      snapshot: null,
      statusSnapshot: null,
    };
    registry.set(key, entry);
  }
  return entry;
}

/** Invalidate memoized snapshots and notify subscribers. */
function notifyEntry(entry: RegistryEntry): void {
  entry.snapshot = null;
  entry.statusSnapshot = null;
  for (const listener of Array.from(entry.listeners)) {
    listener();
  }
}

/**
 * Normalize a provider progress event into the entry's per-file map and
 * aggregate fraction. This is the single place progress shapes are unified:
 *
 * 1. `file` + numeric loaded/total → per-file map, fraction = Σloaded/Σtotal
 * 2. no `file` but numeric loaded/total → single synthetic entry
 * 3. else numeric `progress` → fraction = progress/100
 * 4. `status: 'ready'` without `file` → fraction = 1
 *
 * Also advances the per-attempt high-water mark used to publish a
 * non-decreasing aggregate (see RegistryEntry.maxFraction).
 *
 * NEVER touches `entry.status` — the status machine is driven exclusively by
 * the warmup promise.
 */
function applyProgress(entry: RegistryEntry, progress: AnyLoadProgress): void {
  const hasBytes = typeof progress.loaded === 'number' && typeof progress.total === 'number';

  if (typeof progress.file === 'string' && hasBytes) {
    entry.perFile.set(progress.file, {
      loaded: progress.loaded as number,
      total: progress.total as number,
    });
    let loaded = 0;
    let total = 0;
    for (const file of entry.perFile.values()) {
      loaded += file.loaded;
      total += file.total;
    }
    entry.fraction = total > 0 ? Math.min(loaded / total, 1) : 0;
  } else if (hasBytes) {
    entry.perFile.set(SYNTHETIC_FILE, {
      loaded: progress.loaded as number,
      total: progress.total as number,
    });
    entry.fraction =
      (progress.total as number) > 0
        ? Math.min((progress.loaded as number) / (progress.total as number), 1)
        : 0;
  } else if (typeof progress.progress === 'number') {
    entry.fraction = Math.min(Math.max(progress.progress / 100, 0), 1);
  } else if (progress.status === 'ready' && progress.file === undefined) {
    entry.fraction = 1;
  }

  // Advance the per-attempt high-water mark (see RegistryEntry.maxFraction).
  if (entry.fraction > entry.maxFraction) {
    entry.maxFraction = entry.fraction;
  }

  notifyEntry(entry);
}

/**
 * The aggregate fraction exposed to consumers — non-decreasing within a load
 * attempt (see RegistryEntry.maxFraction for why raw Σloaded/Σtotal can dip).
 */
function publishedFraction(entry: RegistryEntry): number {
  return Math.max(entry.fraction, entry.maxFraction);
}

/**
 * Create the model instance exactly once per key, binding the registry's
 * progress handler. Client-only — providers touch browser APIs at
 * construction.
 */
function ensureModel(entry: RegistryEntry, create: LoadDeps['create']): void {
  if (IS_SERVER || entry.modelCreated) return;
  // Set the flag first so `create` runs at most once even if it throws.
  entry.modelCreated = true;
  entry.model = create((progress) => {
    applyProgress(entry, progress);
  });
  notifyEntry(entry);
}

/**
 * Default warmup: feature-detect the model interface and run one minimal
 * inference to force the provider's lazy load to completion.
 */
async function defaultWarmup(model: unknown): Promise<unknown> {
  const candidate = model as { doGenerate?: unknown; doEmbed?: unknown } | null;

  if (candidate && typeof candidate.doGenerate === 'function') {
    const { generateText } = await import('@localmode/core');
    return generateText({ model: model as LanguageModel, prompt: 'Hi', maxTokens: 1 });
  }

  if (candidate && typeof candidate.doEmbed === 'function') {
    const { embed } = await import('@localmode/core');
    return embed({ model: model as EmbeddingModel, value: '.' });
  }

  throw new Error(
    'useModelLoad: no default warmup is available for this model — it implements neither ' +
      'doGenerate (LanguageModel) nor doEmbed (EmbeddingModel). Pass an explicit `warmup` ' +
      'function that runs one minimal inference for the model type, e.g. ' +
      '`warmup: (model) => transcribe({ model, audio: silentClip })`.'
  );
}

/**
 * Start (or join) the load for a key. The status machine is driven by the
 * warmup promise: resolve → 'ready', reject → 'error'.
 */
function startLoad(key: string, deps: LoadDeps): Promise<void> {
  const entry = getOrCreateEntry(key);

  if (entry.status === 'ready') return Promise.resolve();
  if (entry.loadPromise) return entry.loadPromise;

  const promise = (async () => {
    entry.status = 'loading';
    entry.error = null;
    // New attempt: reset the monotonic high-water mark so a retry can publish
    // a truthful (possibly lower) progress instead of pinning to the failed
    // attempt's peak. Until the first new event, published progress stays at
    // the current raw fraction (consistent with the retained perFile map).
    entry.maxFraction = 0;
    notifyEntry(entry);

    try {
      ensureModel(entry, deps.create);

      if (deps.isCached) {
        // Evaluated once when load() starts. Fire-and-forget: the cache probe
        // informs the UI but must not block or fail the load.
        const probe = deps.isCached;
        void Promise.resolve()
          .then(() => probe())
          .then((cached) => {
            entry.cached = cached;
            notifyEntry(entry);
          })
          .catch(() => {
            // Cache probe failure leaves `cached` undefined.
          });
      }

      const warmup = deps.warmup ?? defaultWarmup;
      await warmup(entry.model);

      entry.status = 'ready';
      entry.fraction = 1;
      entry.error = null;
      notifyEntry(entry);
    } catch (err) {
      entry.status = 'error';
      entry.error = toError(err);
      entry.loadPromise = null; // allow retry via a subsequent load()
      notifyEntry(entry);
      throw entry.error;
    }
  })();

  entry.loadPromise = promise;
  // The registry-held reference must never surface as an unhandled rejection;
  // callers awaiting load() still observe the rejection.
  promise.catch(() => {});
  return promise;
}

/**
 * Subscribe to changes of the registry entry for a key.
 * @internal Shared with useModelStatus.
 */
export function subscribeToModelLoadEntry(key: string, listener: () => void): () => void {
  const entry = getOrCreateEntry(key);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
}

/** Build the full snapshot for an entry (called only when memo is invalidated). */
function buildSnapshot(entry: RegistryEntry): ModelLoadSnapshot {
  let loaded: number | undefined;
  let total: number | undefined;
  if (entry.perFile.size > 0) {
    loaded = 0;
    total = 0;
    for (const file of entry.perFile.values()) {
      loaded += file.loaded;
      total += file.total;
    }
  }

  return {
    status: entry.status,
    progress: publishedFraction(entry),
    perFile: new Map(entry.perFile),
    cached: entry.cached,
    error: entry.error,
    model: entry.model,
    progressValue: {
      ...(loaded !== undefined ? { loaded } : {}),
      ...(total !== undefined ? { total } : {}),
      percent: publishedFraction(entry),
      ...(entry.cached !== undefined ? { cached: entry.cached } : {}),
    },
  };
}

/** Memoized full snapshot — stable reference until the entry changes. */
function getEntrySnapshot(key: string): ModelLoadSnapshot {
  const entry = getOrCreateEntry(key);
  if (entry.snapshot === null) {
    entry.snapshot = buildSnapshot(entry);
  }
  return entry.snapshot;
}

/**
 * Memoized status-view snapshot — stable reference until the entry changes.
 * Keys with no observed lifecycle report not-ready/not-loading.
 * @internal Shared with useModelStatus.
 */
export function getModelStatusSnapshot(key: string): ModelStatusSnapshot {
  const entry = getOrCreateEntry(key);
  if (entry.statusSnapshot === null) {
    entry.statusSnapshot = {
      isReady: entry.status === 'ready',
      isLoading: entry.status === 'loading',
      progress: publishedFraction(entry),
      error: entry.error,
    };
  }
  return entry.statusSnapshot;
}

/**
 * Hook for the full provider-model load lifecycle: constructs the model once
 * per `key` with a registry-bound progress callback, normalizes progress
 * events from all LocalMode providers (transformers per-file, webllm percent,
 * wllama/litert single-file bytes) into one 0-1 aggregate, and drives a
 * status machine from a `warmup` inference (the only reliable "fully loaded"
 * signal, since providers load lazily on first inference).
 *
 * State lives in a module-level registry consumed via `useSyncExternalStore`,
 * so progress survives unmount/remount mid-download and multiple components
 * can observe the same load. SSR renders an inert snapshot (`idle`, 0, no
 * model); the model is created on first client use.
 *
 * @param options - Key, model factory, and optional warmup/cache-probe/autoLoad
 * @returns Load status, normalized progress, the model instance, and load()
 *
 * @example
 * ```tsx
 * import { useModelLoad } from '@localmode/react';
 * import { wllama, isModelCached } from '@localmode/wllama';
 *
 * function Chat() {
 *   const { status, progressValue, model, load } = useModelLoad({
 *     key: 'qwen3-0.6b',
 *     create: (onProgress) => wllama.languageModel('qwen3-0.6b', { onProgress }),
 *     isCached: () => isModelCached('qwen3-0.6b'),
 *   });
 *
 *   if (status !== 'ready') {
 *     return <button onClick={load}>Load model ({(progressValue.percent * 100).toFixed(0)}%)</button>;
 *   }
 *   return <ChatView model={model} />;
 * }
 * ```
 *
 * @throws Never throws during render; `load()` rejects with the warmup error
 * (also exposed as `error`).
 * @see useModelStatus for a read-only view of the same registry by modelId
 */
export function useModelLoad<M>(options: UseModelLoadOptions<M>): UseModelLoadReturn<M> {
  const { key, autoLoad = false } = options;

  // Latest options without retriggering subscriptions on identity changes.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const subscribe = useCallback(
    (listener: () => void) => subscribeToModelLoadEntry(key, listener),
    [key]
  );
  const getSnapshot = useCallback(() => getEntrySnapshot(key), [key]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Create the model on first client use — never during SSR or render.
  useEffect(() => {
    const entry = getOrCreateEntry(key);
    try {
      ensureModel(entry, optionsRef.current.create as LoadDeps['create']);
    } catch (err) {
      entry.status = 'error';
      entry.error = toError(err);
      notifyEntry(entry);
    }
  }, [key]);

  const load = useCallback(async () => {
    if (IS_SERVER) return;
    await startLoad(key, optionsRef.current as unknown as LoadDeps);
  }, [key]);

  useEffect(() => {
    if (!autoLoad) return;
    load().catch(() => {
      // Surfaced via status/error state.
    });
  }, [autoLoad, load]);

  return {
    status: snapshot.status,
    progress: snapshot.progress,
    perFile: snapshot.perFile,
    cached: snapshot.cached,
    error: snapshot.error,
    model: snapshot.model as M | null,
    load,
    progressValue: snapshot.progressValue,
  };
}
