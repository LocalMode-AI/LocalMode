/**
 * Resilient Model Cache Tests
 *
 * Verifies the resilient browser cache for transformers.js model files:
 * a failed Cache API WRITE must never fail a model load (the consumer-reported
 * intermittent `NetworkError: Cache.add() encountered a network error` class).
 *
 * Call-path fidelity: the tests drive the module's public interface exactly the
 * way transformers.js v4 calls it — `getCache()` reads `env.useCustomCache` /
 * `env.customCache`, then `tryCache()`/`storeCachedResource()` call
 * `match(request)`/`put(request, response)` with plain string keys (the
 * `/models/<repo>/<file>` local path and the full remote URL). The mocked
 * boundary is the global `caches` CacheStorage — the exact browser API the
 * resilient cache wraps — never the resilient cache itself.
 *
 * Red-first evidence (two lanes):
 * 1. This suite was authored before `src/resilient-cache.ts` existed and was
 *    run to a failing state (unresolved import) before implementation.
 * 2. The "unguarded stock-style write" control test proves the mocked
 *    `cache.put` genuinely rejects, so the fallback assertions can fail: a
 *    mutation run deleting the try/catch around `cache.put` in
 *    `createResilientModelCache().put` makes the "resolves despite write
 *    failure" tests below fail (verified during implementation; see the
 *    change record).
 *
 * Documented gap (design D4): the upstream intermittent NetworkError cannot be
 * deterministically reproduced against a real browser cache, so the write
 * failure is forced at the same `cache.put` boundary the real error occurs at.
 * The normal end-to-end path (real download populates the real cache) is
 * covered by the real-Chrome verification lane of this change.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** The default cache name stock transformers.js opens (`env.cacheKey`). */
const STOCK_CACHE_NAME = 'transformers-cache';

/** Realistic model-file request keys, mirroring transformers.js hub.js. */
const REMOTE_URL =
  'https://huggingface.co/Xenova/bge-small-en-v1.5/resolve/main/onnx/model_quantized.onnx';
const LOCAL_PATH = '/models/Xenova/bge-small-en-v1.5/onnx/model_quantized.onnx';
const OTHER_URL =
  'https://huggingface.co/Xenova/bge-small-en-v1.5/resolve/main/tokenizer.json';

/** The error class the consumer reported (a DOMException named NetworkError). */
function networkError(): DOMException {
  return new DOMException('Cache.put() encountered a network error', 'NetworkError');
}

/**
 * In-memory stand-in for a browser `Cache` instance with failure injection.
 * Same `match`/`put`/`delete` surface and string-key semantics the resilient
 * cache delegates to.
 */
class MockCache {
  store = new Map<string, Response>();
  putError: Error | DOMException | null = null;
  matchError: Error | DOMException | null = null;
  putCalls: string[] = [];

  async match(request: string): Promise<Response | undefined> {
    if (this.matchError) throw this.matchError;
    return this.store.get(request);
  }

  async put(request: string, response: Response): Promise<void> {
    this.putCalls.push(request);
    if (this.putError) throw this.putError;
    this.store.set(request, response);
  }

  async delete(request: string): Promise<boolean> {
    return this.store.delete(request);
  }
}

/** Minimal `env` shape transformers.js exposes for cache configuration. */
function makeEnv(): {
  useCustomCache: boolean;
  customCache: {
    match(request: string): Promise<unknown>;
    put(request: string, response: Response): Promise<void>;
    delete?(request: string): Promise<boolean>;
  } | null;
  cacheKey: string;
} {
  return { useCustomCache: false, customCache: null, cacheKey: STOCK_CACHE_NAME };
}

/** Stub the global CacheStorage with a mock cache; returns the mock + open spy. */
function stubCaches(cache: MockCache): { open: ReturnType<typeof vi.fn> } {
  const open = vi.fn(async (_name: string) => cache as unknown as Cache);
  vi.stubGlobal('caches', { open });
  return { open };
}

/** Import a fresh copy of the module (module-level warn-once + enable state). */
async function loadModule(): Promise<typeof import('../src/resilient-cache.js')> {
  vi.resetModules();
  return import('../src/resilient-cache.js');
}

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  vi.unstubAllGlobals();
});

describe('createResilientModelCache()', () => {
  it('control: the mocked Cache API put genuinely rejects — an unguarded stock-style write would propagate', async () => {
    // Proves the forced-failure boundary is real: without the resilient
    // wrapper's try/catch, this rejection reaches the caller (the pre-fix
    // Cache.add()-era behavior that failed the consumer's model loads).
    const mock = new MockCache();
    mock.putError = networkError();
    stubCaches(mock);

    const rawCache = await caches.open(STOCK_CACHE_NAME);
    await expect(rawCache.put(REMOTE_URL, new Response('bytes'))).rejects.toThrow(
      'network error'
    );
    // The write was attempted — the failure is in the write, not the plumbing.
    expect(mock.putCalls).toEqual([REMOTE_URL]);
  });

  it('a failed cache write resolves (never throws) and the fetched bytes still serve the load', async () => {
    const mod = await loadModule();
    const mock = new MockCache();
    mock.putError = networkError();
    stubCaches(mock);

    const cache = mod.createResilientModelCache();

    // Mirror the hub.js load flow: cache miss → network fetch → body read →
    // write-back attempted with a fresh Response over the read buffer.
    await expect(cache.match(REMOTE_URL)).resolves.toBeUndefined();
    const fetched = new Response('MODEL-BYTES');
    const buffer = new Uint8Array(await fetched.arrayBuffer());

    await expect(cache.put(REMOTE_URL, new Response(buffer))).resolves.toBeUndefined();

    // The load is served from the already-read network bytes regardless.
    expect(new TextDecoder().decode(buffer)).toBe('MODEL-BYTES');
    // The write was really attempted against the Cache API (not skipped).
    expect(mock.putCalls).toEqual([REMOTE_URL]);
  });

  it('warns exactly once per URL per session, with the URL, the error, and the consequence', async () => {
    const mod = await loadModule();
    const mock = new MockCache();
    mock.putError = networkError();
    stubCaches(mock);

    const cache = mod.createResilientModelCache();

    await cache.put(REMOTE_URL, new Response('a'));
    await cache.put(REMOTE_URL, new Response('b'));
    await cache.put(REMOTE_URL, new Response('c'));

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(warnSpy.mock.calls[0]?.[0]);
    expect(message).toContain(REMOTE_URL); // what failed
    expect(message).toContain('NetworkError'); // why
    expect(message).toContain('network response'); // harmless: load still served
    expect(message).toContain('next load'); // what happens next: retry

    // A different URL is a different failure — it gets its own single warning.
    await cache.put(OTHER_URL, new Response('d'));
    await cache.put(OTHER_URL, new Response('e'));
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(String(warnSpy.mock.calls[1]?.[0])).toContain(OTHER_URL);
  });

  it('hit path: cached responses are returned from the same cache name and keys stock transformers.js uses', async () => {
    const mod = await loadModule();
    const mock = new MockCache();
    const { open } = stubCaches(mock);

    const cache = mod.createResilientModelCache();

    await cache.put(REMOTE_URL, new Response('MODEL-BYTES'));
    const hit = await cache.match(REMOTE_URL);
    expect(hit).toBeInstanceOf(Response);
    await expect((hit as Response).text()).resolves.toBe('MODEL-BYTES');

    // Existing-cache compatibility: the exact stock cache name is opened, and
    // keys are the verbatim strings transformers.js passes (tryCache probes
    // the /models/... local path first, then the remote URL).
    expect(open).toHaveBeenCalledWith(STOCK_CACHE_NAME);
    await expect(cache.match(LOCAL_PATH)).resolves.toBeUndefined();
    mock.store.set(LOCAL_PATH, new Response('LOCAL'));
    await expect((await cache.match(LOCAL_PATH))!.text()).resolves.toBe('LOCAL');

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('honors a custom cache name (a user-overridden env.cacheKey)', async () => {
    const mod = await loadModule();
    const mock = new MockCache();
    const { open } = stubCaches(mock);

    const cache = mod.createResilientModelCache({ cacheName: 'my-app-cache' });
    await cache.match(REMOTE_URL);
    expect(open).toHaveBeenCalledWith('my-app-cache');
  });

  it('a failing match degrades to a miss instead of throwing', async () => {
    const mod = await loadModule();
    const mock = new MockCache();
    mock.matchError = networkError();
    stubCaches(mock);

    const cache = mod.createResilientModelCache();
    await expect(cache.match(REMOTE_URL)).resolves.toBeUndefined();
  });

  it('delete delegates to the underlying cache and never throws', async () => {
    const mod = await loadModule();
    const mock = new MockCache();
    stubCaches(mock);

    const cache = mod.createResilientModelCache();
    await cache.put(REMOTE_URL, new Response('x'));
    await expect(cache.delete(REMOTE_URL)).resolves.toBe(true);
    await expect(cache.delete(REMOTE_URL)).resolves.toBe(false);
    await expect(cache.match(REMOTE_URL)).resolves.toBeUndefined();
  });

  it('no Cache API (typeof caches === "undefined"): always-miss, no-op writes, no throw, no noise', async () => {
    // jsdom does not define `caches` — this is the genuine no-Cache-API
    // environment (Node, some private-browsing modes), not a simulation.
    expect(typeof caches).toBe('undefined');

    const mod = await loadModule();
    const cache = mod.createResilientModelCache();

    await expect(cache.match(REMOTE_URL)).resolves.toBeUndefined();
    await expect(cache.put(REMOTE_URL, new Response('x'))).resolves.toBeUndefined();
    await expect(cache.delete(REMOTE_URL)).resolves.toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('caches.open() failure (private-browsing iframe class) degrades to always-miss with one warning', async () => {
    const mod = await loadModule();
    const open = vi.fn(async () => {
      throw new DOMException(
        'An attempt was made to break through the security policy of the user agent.',
        'SecurityError'
      );
    });
    vi.stubGlobal('caches', { open });

    const cache = mod.createResilientModelCache();
    await expect(cache.match(REMOTE_URL)).resolves.toBeUndefined();
    await expect(cache.put(REMOTE_URL, new Response('x'))).resolves.toBeUndefined();
    await expect(cache.match(OTHER_URL)).resolves.toBeUndefined();
    await expect(cache.delete(REMOTE_URL)).resolves.toBe(false);

    // One warning for the unusable cache, not one per operation.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain(STOCK_CACHE_NAME);
  });
});

describe('installResilientModelCache()', () => {
  it('installs into the transformers.js env exactly as getCache() expects (useCustomCache + customCache)', async () => {
    const mod = await loadModule();
    const mock = new MockCache();
    stubCaches(mock);

    const env = makeEnv();
    expect(mod.installResilientModelCache(env)).toBe(true);

    expect(env.useCustomCache).toBe(true);
    expect(env.customCache).not.toBeNull();
    // The installed cache is live: a round-trip lands in the Cache API store.
    await env.customCache!.put(REMOTE_URL, new Response('MODEL-BYTES'));
    expect(mock.store.has(REMOTE_URL)).toBe(true);
    const hit = (await env.customCache!.match(REMOTE_URL)) as Response;
    await expect(hit.text()).resolves.toBe('MODEL-BYTES');
  });

  it('is idempotent — repeated installs (one per model load) keep the same cache instance', async () => {
    const mod = await loadModule();
    stubCaches(new MockCache());

    const env = makeEnv();
    mod.installResilientModelCache(env);
    const first = env.customCache;
    mod.installResilientModelCache(env);
    expect(env.customCache).toBe(first);
  });

  it('opens a user-overridden env.cacheKey instead of the default name', async () => {
    const mod = await loadModule();
    const mock = new MockCache();
    const { open } = stubCaches(mock);

    const env = { ...makeEnv(), cacheKey: 'my-app-cache' };
    mod.installResilientModelCache(env);
    await env.customCache!.match(REMOTE_URL);
    expect(open).toHaveBeenCalledWith('my-app-cache');
  });

  it('never overwrites a user-supplied custom cache', async () => {
    const mod = await loadModule();
    stubCaches(new MockCache());

    const userCache = {
      match: async () => undefined,
      put: async () => undefined,
    };
    const env = { ...makeEnv(), useCustomCache: true, customCache: userCache };

    expect(mod.installResilientModelCache(env)).toBe(false);
    expect(env.customCache).toBe(userCache);
    expect(env.useCustomCache).toBe(true);
  });

  it('skips installation when the Cache API is unavailable, preserving stock behavior (Node FileCache)', async () => {
    // Installing a custom cache with no `caches` would preempt transformers.js
    // Node FileCache in getCache() — the installer must leave env untouched.
    expect(typeof caches).toBe('undefined');

    const mod = await loadModule();
    const env = makeEnv();
    expect(mod.installResilientModelCache(env)).toBe(false);
    expect(env.useCustomCache).toBe(false);
    expect(env.customCache).toBeNull();
  });
});

describe('opt-out via createTransformers({ resilientCache })', () => {
  it('resilientCache: false leaves the transformers.js env untouched', async () => {
    vi.resetModules();
    stubCaches(new MockCache());
    const mod = await import('../src/resilient-cache.js');
    const { createTransformers } = await import('../src/provider.js');

    createTransformers({ resilientCache: false });

    const env = makeEnv();
    expect(mod.installResilientModelCache(env)).toBe(false);
    expect(env.useCustomCache).toBe(false);
    expect(env.customCache).toBeNull();
  });

  it('the default provider does not flip the setting (enabled by default)', async () => {
    vi.resetModules();
    stubCaches(new MockCache());
    const mod = await import('../src/resilient-cache.js');
    const { createTransformers } = await import('../src/provider.js');

    createTransformers(); // no resilientCache setting
    const env = makeEnv();
    expect(mod.installResilientModelCache(env)).toBe(true);
    expect(env.useCustomCache).toBe(true);
  });

  it('resilientCache: true re-enables after an opt-out', async () => {
    vi.resetModules();
    stubCaches(new MockCache());
    const mod = await import('../src/resilient-cache.js');
    const { createTransformers } = await import('../src/provider.js');

    createTransformers({ resilientCache: false });
    createTransformers({ resilientCache: true });

    const env = makeEnv();
    expect(mod.installResilientModelCache(env)).toBe(true);
    expect(env.useCustomCache).toBe(true);
  });

  it('opting out after installation uninstalls and restores stock env values', async () => {
    vi.resetModules();
    stubCaches(new MockCache());
    const mod = await import('../src/resilient-cache.js');
    const { createTransformers } = await import('../src/provider.js');

    const env = makeEnv();
    mod.installResilientModelCache(env);
    expect(env.useCustomCache).toBe(true);

    createTransformers({ resilientCache: false });
    expect(env.useCustomCache).toBe(false);
    expect(env.customCache).toBeNull();
  });
});
