/**
 * Resilient Model Cache
 *
 * A drop-in replacement for the browser Cache API cache that Transformers.js
 * uses for model files, whose write path can never fail a model load.
 *
 * Transformers.js caches downloaded model files in the browser Cache API
 * (cache name `'transformers-cache'`, keyed by the file's request string).
 * Some browsers intermittently reject those cache writes (the
 * `NetworkError: Cache.add() encountered a network error` failure class),
 * and private-browsing modes can make the cache unusable entirely. The
 * resilient cache delegates reads and writes to the exact same underlying
 * cache — same name, same keys, so previously cached models keep hitting —
 * but treats every cache failure as a degraded cache, never a failed load:
 *
 * - a failed write logs one warning per file per session and lets the model
 *   finish loading from the already-fetched network response
 * - a failed read is a cache miss (the file is re-fetched)
 * - an unusable or missing Cache API degrades to always-miss without throwing
 *
 * Installed into the Transformers.js environment automatically when models
 * load (see {@link installResilientModelCache}); opt out with
 * `createTransformers({ resilientCache: false })`.
 *
 * @packageDocumentation
 */

/** The cache name stock Transformers.js opens for model files. */
const DEFAULT_CACHE_NAME = 'transformers-cache';

/**
 * URLs (and cache names) already warned about this session.
 * One warning per key keeps a flaky cache from flooding the console —
 * every failure past the first is the same actionable fact.
 */
const warnedKeys = new Set<string>();

/** Whether {@link installResilientModelCache} is allowed to touch the env. */
let installEnabled = true;

/** Caches created by {@link createResilientModelCache} (install/uninstall bookkeeping). */
const ownCaches = new WeakSet<object>();

/** The env objects this module has installed into, for opt-out uninstall. */
const installedEnvs = new Set<TransformersCacheEnv>();

/**
 * The structural surface Transformers.js requires of a custom cache
 * (`env.customCache`): the `match` and `put` functions of the Web Cache API,
 * with string request keys, plus an optional `delete` used by its
 * cache-clearing utilities.
 */
export interface TransformersCacheLike {
  /** Returns the cached response for a request key, or `undefined` on miss. */
  match(request: string): Promise<unknown>;

  /** Stores a response under a request key. */
  put(request: string, response: Response): Promise<void>;

  /** Deletes a cached entry. Returns whether an entry was deleted. */
  delete?(request: string): Promise<boolean>;
}

/**
 * The cache-related slice of the Transformers.js `env` object that
 * {@link installResilientModelCache} configures. Structurally compatible with
 * the `env` exported by `@huggingface/transformers`.
 */
export interface TransformersCacheEnv {
  /** Whether Transformers.js should use `customCache` instead of its defaults. */
  useCustomCache: boolean;

  /** The custom cache Transformers.js calls `match`/`put` on. */
  customCache: TransformersCacheLike | null;

  /** The Cache API cache name Transformers.js opens by default. */
  cacheKey?: string;
}

/**
 * Options for {@link createResilientModelCache}.
 */
export interface ResilientModelCacheOptions {
  /**
   * The Cache API cache name to open.
   *
   * Defaults to `'transformers-cache'` — the name stock Transformers.js uses,
   * so models cached before the resilient cache existed keep hitting.
   */
  cacheName?: string;
}

/**
 * A resilient model-file cache: the Web Cache API `match`/`put`/`delete`
 * surface Transformers.js expects, where no cache failure ever propagates
 * to the model load.
 */
export interface ResilientModelCache {
  /**
   * Look up a cached response.
   *
   * @param request - The request key (a model-file URL or `/models/...` path)
   * @returns The cached response, or `undefined` on miss or any cache failure
   */
  match(request: string): Promise<Response | undefined>;

  /**
   * Store a response in the cache.
   *
   * Never rejects: a failed write logs one warning per URL per session and
   * resolves, so the model load continues from the network response.
   *
   * @param request - The request key to store under
   * @param response - The response to cache
   */
  put(request: string, response: Response): Promise<void>;

  /**
   * Delete a cached entry.
   *
   * @param request - The request key to delete
   * @returns Whether an entry was deleted (`false` on any cache failure)
   */
  delete(request: string): Promise<boolean>;
}

/**
 * Log a warning once per key per session.
 */
function warnOnce(key: string, message: string): void {
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  console.warn(message);
}

/**
 * Create a resilient model-file cache over the browser Cache API.
 *
 * Delegates to the same cache stock Transformers.js uses (name
 * `'transformers-cache'`, verbatim string keys), so existing cached models
 * keep hitting — only the failure handling differs:
 *
 * - `put()` never rejects. A failed write (e.g. the intermittent
 *   `NetworkError` some browsers throw mid-write, or `QuotaExceededError`)
 *   logs one warning per URL per session; the model still loads from the
 *   already-fetched network response, and caching is retried on the next load.
 *   `Cache.add()` is never used — writes go through `Cache.put()` with the
 *   response Transformers.js already fetched.
 * - `match()` returns `undefined` (a miss) instead of throwing.
 * - If the Cache API is missing (`typeof caches === 'undefined'`) or cannot
 *   be opened (e.g. private-browsing iframes), every read is a miss and every
 *   write is a no-op — never an error.
 *
 * @param options - Optional cache-name override (defaults to the stock
 *   `'transformers-cache'`)
 * @returns A cache implementing the `match`/`put`/`delete` interface
 *   Transformers.js expects of `env.customCache`
 *
 * @example
 * ```ts
 * import { createResilientModelCache } from '@localmode/transformers';
 * import { env } from '@huggingface/transformers';
 *
 * // Manual installation (done automatically when models load):
 * env.customCache = createResilientModelCache();
 * env.useCustomCache = true;
 * ```
 *
 * @see installResilientModelCache
 */
export function createResilientModelCache(
  options?: ResilientModelCacheOptions
): ResilientModelCache {
  const cacheName = options?.cacheName ?? DEFAULT_CACHE_NAME;

  // Opened lazily on first use and shared by all operations; `null` means
  // the Cache API is unusable this session (always-miss mode).
  let cachePromise: Promise<Cache | null> | null = null;

  function openCache(): Promise<Cache | null> {
    if (!cachePromise) {
      cachePromise = (async () => {
        if (typeof caches === 'undefined') {
          return null;
        }
        try {
          return await caches.open(cacheName);
        } catch (error) {
          warnOnce(
            `open:${cacheName}`,
            `[LocalMode] Could not open the browser cache "${cacheName}" (${String(error)}). ` +
              `Model files will load from the network without being cached this session — ` +
              `loads still work, but downloads are not persisted. This typically happens in ` +
              `private-browsing modes or sandboxed iframes that block Cache Storage.`
          );
          return null;
        }
      })();
    }
    return cachePromise;
  }

  const resilientCache: ResilientModelCache = {
    async match(request: string): Promise<Response | undefined> {
      const cache = await openCache();
      if (!cache) return undefined;
      try {
        return await cache.match(request);
      } catch {
        // A failed read is a miss — the file is simply re-fetched.
        return undefined;
      }
    },

    async put(request: string, response: Response): Promise<void> {
      const cache = await openCache();
      if (!cache) return;
      try {
        await cache.put(request, response);
      } catch (error) {
        warnOnce(
          request,
          `[LocalMode] Failed to cache model file "${request}" in the browser cache ` +
            `"${cacheName}" (${String(error)}). This does not affect the current load — ` +
            `the file was already fetched and the model loads from the network response; ` +
            `caching will be retried on the next load. If this persists, check available ` +
            `storage (navigator.storage.estimate()) or private-browsing restrictions.`
        );
      }
    },

    async delete(request: string): Promise<boolean> {
      const cache = await openCache();
      if (!cache) return false;
      try {
        return await cache.delete(request);
      } catch {
        return false;
      }
    },
  };

  ownCaches.add(resilientCache);
  return resilientCache;
}

/**
 * Enable or disable installation of the resilient model cache.
 *
 * The Transformers.js environment is a global singleton, so this setting is
 * global too: disabling it restores stock Transformers.js caching for all
 * subsequently loaded models, and uninstalls the resilient cache from any
 * environment it was already installed into. Prefer configuring it through
 * the provider: `createTransformers({ resilientCache: false })`.
 *
 * @param enabled - `true` (the default) to install the resilient cache when
 *   models load; `false` to keep stock Transformers.js caching
 *
 * @see installResilientModelCache
 */
export function setResilientModelCacheEnabled(enabled: boolean): void {
  installEnabled = enabled;
  if (enabled) return;

  // Opt-out restores stock behavior even if models already loaded: remove
  // only caches this module installed, never a user-supplied custom cache.
  for (const env of installedEnvs) {
    if (env.customCache && ownCaches.has(env.customCache)) {
      env.useCustomCache = false;
      env.customCache = null;
    }
  }
  installedEnvs.clear();
}

/**
 * Install the resilient model cache into the Transformers.js environment.
 *
 * Idempotent and safe to call before every model load. It configures
 * `env.useCustomCache` / `env.customCache` with a
 * {@link createResilientModelCache | resilient cache} over the same cache
 * name Transformers.js would open itself (`env.cacheKey`, default
 * `'transformers-cache'`), unless:
 *
 * - installation is disabled (`createTransformers({ resilientCache: false })`)
 * - the environment has no Cache API (`typeof caches === 'undefined'`) —
 *   installing there would bypass the Node.js file-system cache, so stock
 *   behavior is kept
 * - a custom cache is already configured (a user-supplied `env.customCache`
 *   is never overwritten)
 *
 * @param env - The Transformers.js `env` object (or any object with its
 *   cache-configuration fields)
 * @returns `true` if the resilient cache is installed (now or from an earlier
 *   call), `false` if installation was skipped
 *
 * @example
 * ```ts
 * import { env } from '@huggingface/transformers';
 * import { installResilientModelCache } from '@localmode/transformers';
 *
 * installResilientModelCache(env);
 * ```
 *
 * @see createResilientModelCache
 * @see setResilientModelCacheEnabled
 */
export function installResilientModelCache(env: TransformersCacheEnv): boolean {
  if (!installEnabled) return false;

  // Without the Cache API, Transformers.js falls back to its file-system
  // cache (Node) or to no caching (browser) — both preferable to an
  // always-miss custom cache, which getCache() would pick first.
  if (typeof caches === 'undefined') return false;

  // Already installed by this module — keep the same instance.
  if (env.customCache && ownCaches.has(env.customCache)) {
    env.useCustomCache = true;
    installedEnvs.add(env);
    return true;
  }

  // Respect a user-supplied custom cache.
  if (env.customCache) return false;

  env.customCache = createResilientModelCache({
    cacheName: typeof env.cacheKey === 'string' ? env.cacheKey : DEFAULT_CACHE_NAME,
  });
  env.useCustomCache = true;
  installedEnvs.add(env);
  return true;
}
