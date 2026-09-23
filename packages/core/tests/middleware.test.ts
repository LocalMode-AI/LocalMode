/**
 * @fileoverview Tests for middleware system (caching, logging, retry, validation, rate limit)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cachingMiddleware,
  createCachingMiddleware,
  loggingMiddleware,
  createLoggingMiddleware,
  validationMiddleware,
  createValidationMiddleware,
  retryMiddleware,
  createRetryMiddleware,
  rateLimitMiddleware,
  createRateLimitMiddleware,
  wrapVectorDB,
  wrapEmbeddingModel,
  composeVectorDBMiddleware,
  createVectorDB,
  createMockEmbeddingModel,
} from '../src/index.js';
import type { VectorDB, VectorDBMiddleware } from '../src/index.js';

const DIMS = 8;

let dbCounter = 0;
async function createMemoryDB(): Promise<VectorDB> {
  dbCounter++;
  return createVectorDB({ name: `middleware-test-${dbCounter}`, dimensions: DIMS, storage: 'memory' });
}

function unit(index: number): Float32Array {
  const v = new Float32Array(DIMS);
  v[index % DIMS] = 1;
  return v;
}

describe('cachingMiddleware', () => {
  let db: VectorDB;

  beforeEach(async () => {
    db = await createMemoryDB();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await db.close();
  });

  it('serves a repeated search from the cache', async () => {
    const searchSpy = vi.spyOn(db, 'search');
    const wrappedDb = wrapVectorDB({ db, middleware: cachingMiddleware() });
    await wrappedDb.add({ id: 'doc-1', vector: unit(0), metadata: { text: 'hello' } });

    const first = await wrappedDb.search(unit(0), { k: 5 });
    const second = await wrappedDb.search(unit(0), { k: 5 });

    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(first.map((r) => r.id)).toEqual(['doc-1']);
    expect(second).toEqual(first);
  });

  it('keys the cache on the whole query and on the search options', async () => {
    const searchSpy = vi.spyOn(db, 'search');
    const wrappedDb = wrapVectorDB({ db, middleware: cachingMiddleware() });
    await wrappedDb.add({ id: 'doc-1', vector: unit(0), metadata: {} });
    await wrappedDb.add({ id: 'doc-2', vector: unit(DIMS - 1), metadata: {} });

    // Identical in the first DIMS - 1 components, different in the last one.
    const a = new Float32Array(DIMS).fill(0.1);
    const b = new Float32Array(DIMS).fill(0.1);
    b[DIMS - 1] = 0.9;

    await wrappedDb.search(a, { k: 1 });
    const resultB = await wrappedDb.search(b, { k: 1 });
    await wrappedDb.search(a, { k: 2 });

    expect(searchSpy).toHaveBeenCalledTimes(3);
    expect(resultB[0].id).toBe('doc-2');
  });

  it('does not add keys to the caller’s search options', async () => {
    const searchSpy = vi.spyOn(db, 'search');
    const wrappedDb = wrapVectorDB({ db, middleware: cachingMiddleware() });
    await wrappedDb.add({ id: 'doc-1', vector: unit(0), metadata: {} });
    const options = { k: 3 };

    await wrappedDb.search(unit(0), options);
    await wrappedDb.search(unit(0), options);

    expect(options).toEqual({ k: 3 });
    expect(searchSpy.mock.calls[0][1]).toEqual({ k: 3 });
  });

  it('evicts the least recently used entry beyond maxSearchResults', async () => {
    const searchSpy = vi.spyOn(db, 'search');
    const wrappedDb = wrapVectorDB({
      db,
      middleware: createCachingMiddleware({ maxSearchResults: 2 }),
    });
    await wrappedDb.add({ id: 'doc-1', vector: unit(0), metadata: {} });

    await wrappedDb.search(unit(1), { k: 1 });
    await wrappedDb.search(unit(2), { k: 1 });
    await wrappedDb.search(unit(3), { k: 1 }); // evicts unit(1)
    expect(searchSpy).toHaveBeenCalledTimes(3);

    await wrappedDb.search(unit(3), { k: 1 }); // cached
    expect(searchSpy).toHaveBeenCalledTimes(3);

    await wrappedDb.search(unit(1), { k: 1 }); // evicted, hits the DB again
    expect(searchSpy).toHaveBeenCalledTimes(4);
  });

  it('expires entries after ttlMs', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const searchSpy = vi.spyOn(db, 'search');
    const wrappedDb = wrapVectorDB({ db, middleware: cachingMiddleware({ ttlMs: 1000 }) });
    await wrappedDb.add({ id: 'doc-1', vector: unit(0), metadata: {} });

    await wrappedDb.search(unit(0), { k: 5 });
    vi.advanceTimersByTime(900);
    await wrappedDb.search(unit(0), { k: 5 });
    expect(searchSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(200);
    await wrappedDb.search(unit(0), { k: 5 });
    expect(searchSpy).toHaveBeenCalledTimes(2);
  });

  it('invalidates cached searches on add, update, delete, deleteWhere and clear', async () => {
    const searchSpy = vi.spyOn(db, 'search');
    const wrappedDb = wrapVectorDB({ db, middleware: cachingMiddleware() });
    await wrappedDb.add({ id: 'doc-1', vector: unit(0), metadata: { tag: 'a' } });

    const query = unit(0);
    const search = () => wrappedDb.search(query, { k: 5 });

    await search();
    await wrappedDb.add({ id: 'doc-2', vector: unit(0), metadata: { tag: 'b' } });
    expect((await search()).map((r) => r.id).sort()).toEqual(['doc-1', 'doc-2']);

    await wrappedDb.update('doc-2', { metadata: { tag: 'c' } });
    expect((await search()).find((r) => r.id === 'doc-2')?.metadata).toEqual({ tag: 'c' });

    await wrappedDb.delete('doc-2');
    expect((await search()).map((r) => r.id)).toEqual(['doc-1']);

    await wrappedDb.deleteWhere({ tag: 'a' });
    expect(await search()).toEqual([]);

    await wrappedDb.add({ id: 'doc-3', vector: unit(0), metadata: {} });
    await search();
    await wrappedDb.clear();
    expect(await search()).toEqual([]);

    expect(searchSpy).toHaveBeenCalledTimes(7);
  });

  it('invalidates cached searches on import', async () => {
    const wrappedDb = wrapVectorDB({ db, middleware: cachingMiddleware() });
    await wrappedDb.add({ id: 'doc-1', vector: unit(0), metadata: {} });
    const exported = await wrappedDb.export();
    await wrappedDb.clear();

    expect(await wrappedDb.search(unit(0), { k: 5 })).toEqual([]);
    await wrappedDb.import(exported);

    expect((await wrappedDb.search(unit(0), { k: 5 })).map((r) => r.id)).toEqual(['doc-1']);
  });

  it('serves a repeated get from the document cache and drops it on update', async () => {
    const getSpy = vi.spyOn(db, 'get');
    const wrappedDb = wrapVectorDB({ db, middleware: cachingMiddleware() });
    await wrappedDb.add({ id: 'doc-1', vector: unit(0), metadata: { v: 1 } });

    expect((await wrappedDb.get('doc-1'))?.metadata).toEqual({ v: 1 });
    expect((await wrappedDb.get('doc-1'))?.metadata).toEqual({ v: 1 });
    expect(getSpy).toHaveBeenCalledTimes(1);

    await wrappedDb.update('doc-1', { metadata: { v: 2 } });

    expect((await wrappedDb.get('doc-1'))?.metadata).toEqual({ v: 2 });
    expect(getSpy).toHaveBeenCalledTimes(2);
  });

  it('bounds the document cache by maxEmbeddings, independently of maxSearchResults', async () => {
    const getSpy = vi.spyOn(db, 'get');
    const wrappedDb = wrapVectorDB({
      db,
      middleware: cachingMiddleware({ maxSearchResults: 1, maxEmbeddings: 3 }),
    });
    for (const i of [1, 2, 3, 4]) {
      await wrappedDb.add({ id: `doc-${i}`, vector: unit(i), metadata: { i } });
    }

    await wrappedDb.get('doc-1');
    await wrappedDb.get('doc-2');
    await wrappedDb.get('doc-3');
    expect(getSpy).toHaveBeenCalledTimes(3);

    // Three documents fit, even though the search cache holds only one entry
    expect((await wrappedDb.get('doc-1'))?.metadata).toEqual({ i: 1 });
    expect((await wrappedDb.get('doc-2'))?.metadata).toEqual({ i: 2 });
    expect((await wrappedDb.get('doc-3'))?.metadata).toEqual({ i: 3 });
    expect(getSpy).toHaveBeenCalledTimes(3);

    // A fourth document evicts the least recently used one (doc-1)
    await wrappedDb.get('doc-4');
    expect(getSpy).toHaveBeenCalledTimes(4);
    await wrappedDb.get('doc-3'); // still cached
    expect(getSpy).toHaveBeenCalledTimes(4);
    expect((await wrappedDb.get('doc-1'))?.metadata).toEqual({ i: 1 }); // evicted
    expect(getSpy).toHaveBeenCalledTimes(5);
    expect(getSpy).toHaveBeenLastCalledWith('doc-1');
  });

  it('bypasses the caches when they are disabled', async () => {
    const searchSpy = vi.spyOn(db, 'search');
    const getSpy = vi.spyOn(db, 'get');
    const wrappedDb = wrapVectorDB({
      db,
      middleware: cachingMiddleware({ cacheSearchResults: false, cacheDocuments: false }),
    });
    await wrappedDb.add({ id: 'doc-1', vector: unit(0), metadata: {} });

    await wrappedDb.search(unit(0));
    await wrappedDb.search(unit(0));
    await wrappedDb.get('doc-1');
    await wrappedDb.get('doc-1');

    expect(searchSpy).toHaveBeenCalledTimes(2);
    expect(getSpy).toHaveBeenCalledTimes(2);
  });
});

describe('loggingMiddleware', () => {
  let db: VectorDB;

  beforeEach(async () => {
    db = await createMemoryDB();
  });

  afterEach(async () => {
    await db.close();
  });

  function capture() {
    const entries: Array<{ operation: string; data: Record<string, unknown> }> = [];
    const formatter = (operation: string, data: Record<string, unknown>) => {
      entries.push({ operation, data });
      return operation;
    };
    const lines: unknown[][] = [];
    const logger = (...args: unknown[]) => lines.push(args);
    return { entries, lines, formatter, logger };
  }

  it('logs add start and completion through the logger', async () => {
    const { lines, logger } = capture();
    const wrappedDb = wrapVectorDB({ db, middleware: loggingMiddleware({ logger }) });

    await wrappedDb.add({ id: 'doc-1', vector: unit(0), metadata: { text: 'hello' } });

    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual([
      '[VectorDB:INFO]',
      'add:start',
      { id: 'doc-1', hasVector: true, hasMetadata: true },
    ]);
    expect(lines[1][1]).toBe('add:complete');
    expect(lines[1][2]).toMatchObject({ id: 'doc-1' });
    expect(typeof (lines[1][2] as { durationMs: unknown }).durationMs).toBe('number');
  });

  it('logs a search with its result count and duration', async () => {
    const { entries, formatter, logger } = capture();
    const wrappedDb = wrapVectorDB({
      db,
      middleware: createLoggingMiddleware({ logger, formatter }),
    });
    await wrappedDb.add({ id: 'doc-1', vector: unit(0), metadata: {} });
    const options = { k: 5 };

    await wrappedDb.search(unit(0), options);

    const start = entries.find((e) => e.operation === 'search:start');
    const complete = entries.find((e) => e.operation === 'search:complete');
    expect(start?.data).toEqual({ k: 5, hasFilter: false, dimensions: DIMS });
    expect(complete?.data.resultCount).toBe(1);
    expect(complete?.data.topScore).toBeCloseTo(1, 5);
    expect(complete?.data.durationMs).toBeGreaterThanOrEqual(0);
    expect(options).toEqual({ k: 5 });
  });

  it('omits durations when timing is disabled', async () => {
    const { entries, formatter, logger } = capture();
    const wrappedDb = wrapVectorDB({
      db,
      middleware: loggingMiddleware({ logger, formatter, timing: false }),
    });
    await wrappedDb.add({ id: 'doc-1', vector: unit(0), metadata: {} });
    await wrappedDb.search(unit(0));

    expect(entries.find((e) => e.operation === 'add:complete')?.data.durationMs).toBeUndefined();
    expect(entries.find((e) => e.operation === 'search:complete')?.data.durationMs).toBeUndefined();
  });

  it('logs only the listed operations', async () => {
    const { entries, formatter, logger } = capture();
    const wrappedDb = wrapVectorDB({
      db,
      middleware: loggingMiddleware({ logger, formatter, operations: ['search'] }),
    });

    await wrappedDb.add({ id: 'doc-1', vector: unit(0), metadata: {} });
    await wrappedDb.get('doc-1');
    await wrappedDb.search(unit(0), { k: 5 });
    await wrappedDb.delete('doc-1');

    expect(entries.map((e) => e.operation)).toEqual(['search:start', 'search:complete']);
  });

  it('logs failed operations and still rethrows', async () => {
    const { entries, formatter, logger } = capture();
    const wrappedDb = wrapVectorDB({ db, middleware: loggingMiddleware({ logger, formatter }) });

    await expect(
      wrappedDb.add({ id: 'doc-1', vector: new Float32Array(3), metadata: {} })
    ).rejects.toThrow(/dimension/i);

    expect(entries.at(-1)?.operation).toBe('error');
    expect(entries.at(-1)?.data).toMatchObject({ operation: 'add' });
  });
});

describe('validationMiddleware', () => {
  let db: VectorDB;

  beforeEach(async () => {
    db = await createMemoryDB();
  });

  afterEach(async () => {
    await db.close();
  });

  it('accepts a valid document and rejects an empty id', async () => {
    const wrappedDb = wrapVectorDB({ db, middleware: validationMiddleware() });

    await wrappedDb.add({ id: 'doc-1', vector: unit(0), metadata: {} });
    await expect(
      wrappedDb.add({ id: '', vector: unit(0), metadata: {} })
    ).rejects.toThrow('Document must have a valid string ID');

    expect((await wrappedDb.stats()).count).toBe(1);
  });

  it('rejects vectors of the wrong dimension before they reach the database', async () => {
    const addSpy = vi.spyOn(db, 'add');
    const wrappedDb = wrapVectorDB({
      db,
      middleware: createValidationMiddleware({ dimensions: DIMS }),
    });

    await expect(
      wrappedDb.add({ id: 'doc-1', vector: new Float32Array(4), metadata: {} })
    ).rejects.toThrow(`Vector dimension mismatch: expected ${DIMS}, got 4`);
    expect(addSpy).not.toHaveBeenCalled();
  });

  it('rejects NaN and Infinity vector values', async () => {
    const wrappedDb = wrapVectorDB({ db, middleware: validationMiddleware() });
    const bad = unit(0);
    bad[3] = Number.NaN;

    await expect(wrappedDb.add({ id: 'doc-1', vector: bad, metadata: {} })).rejects.toThrow(
      'Invalid vector value at index 3: NaN'
    );
  });

  it('rejects oversized metadata and applies a custom validator', async () => {
    const wrappedDb = wrapVectorDB({
      db,
      middleware: validationMiddleware({
        maxMetadataSize: 32,
        customValidator: (doc) => (doc.id.startsWith('ok-') ? true : 'id must start with ok-'),
      }),
    });

    await expect(
      wrappedDb.add({ id: 'ok-1', vector: unit(0), metadata: { text: 'x'.repeat(64) } })
    ).rejects.toThrow(/^Metadata exceeds maximum size: \d+ > 32$/);
    await expect(
      wrappedDb.add({ id: 'bad-1', vector: unit(0), metadata: {} })
    ).rejects.toThrow('Custom validation failed: id must start with ok-');
    await wrappedDb.add({ id: 'ok-2', vector: unit(0), metadata: {} });

    expect((await wrappedDb.stats()).count).toBe(1);
  });
});

describe('retryMiddleware', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries a failing embedding call until it succeeds', async () => {
    const onEmbed = vi.fn();
    const model = createMockEmbeddingModel({ dimensions: 4, failCount: 2, onEmbed });
    const wrapped = wrapEmbeddingModel({
      model,
      middleware: retryMiddleware({ maxRetries: 3, initialDelayMs: 1, jitter: false }),
    });

    const result = await wrapped.doEmbed({ values: ['hello'] });

    expect(onEmbed).toHaveBeenCalledTimes(3);
    expect(result.embeddings).toHaveLength(1);
    expect(result.embeddings[0]).toBeInstanceOf(Float32Array);
  });

  it('waits with exponential backoff between attempts', async () => {
    vi.useFakeTimers();
    const onEmbed = vi.fn();
    const model = createMockEmbeddingModel({ dimensions: 4, failCount: 2, onEmbed });
    const wrapped = wrapEmbeddingModel({
      model,
      middleware: createRetryMiddleware({
        maxRetries: 3,
        initialDelayMs: 100,
        backoffMultiplier: 2,
        jitter: false,
      }),
    });

    const promise = wrapped.doEmbed({ values: ['hello'] });

    await vi.advanceTimersByTimeAsync(0);
    expect(onEmbed).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(99);
    expect(onEmbed).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(onEmbed).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(199);
    expect(onEmbed).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(onEmbed).toHaveBeenCalledTimes(3);

    await expect(promise).resolves.toMatchObject({ embeddings: [expect.any(Float32Array)] });
  });

  it('gives up after maxRetries and rethrows the last error', async () => {
    const onEmbed = vi.fn();
    const model = createMockEmbeddingModel({
      dimensions: 4,
      failCount: 10,
      failError: new Error('Permanent failure'),
      onEmbed,
    });
    const wrapped = wrapEmbeddingModel({
      model,
      middleware: retryMiddleware({ maxRetries: 2, initialDelayMs: 1, jitter: false }),
    });

    await expect(wrapped.doEmbed({ values: ['hello'] })).rejects.toThrow('Permanent failure');
    expect(onEmbed).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('stops immediately when shouldRetry rejects the error', async () => {
    const onEmbed = vi.fn();
    const model = createMockEmbeddingModel({
      dimensions: 4,
      failCount: 10,
      failError: new Error('bad input'),
      onEmbed,
    });
    const shouldRetry = vi.fn(() => false);
    const wrapped = wrapEmbeddingModel({
      model,
      middleware: retryMiddleware({ maxRetries: 5, initialDelayMs: 1, shouldRetry }),
    });

    await expect(wrapped.doEmbed({ values: ['hello'] })).rejects.toThrow('bad input');
    expect(onEmbed).toHaveBeenCalledTimes(1);
    expect(shouldRetry).toHaveBeenCalledWith(expect.objectContaining({ message: 'bad input' }), 1);
  });
});

describe('rateLimitMiddleware', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays calls beyond maxRequests until the window frees up', async () => {
    const onEmbed = vi.fn();
    const onRateLimit = vi.fn();
    const model = createMockEmbeddingModel({ dimensions: 4, onEmbed });
    const wrapped = wrapEmbeddingModel({
      model,
      middleware: rateLimitMiddleware({ maxRequests: 2, windowMs: 1000, onRateLimit }),
    });

    await Promise.all([wrapped.doEmbed({ values: ['a'] }), wrapped.doEmbed({ values: ['b'] })]);
    expect(onEmbed).toHaveBeenCalledTimes(2);

    const third = wrapped.doEmbed({ values: ['c'] });
    await vi.advanceTimersByTimeAsync(0);
    expect(onEmbed).toHaveBeenCalledTimes(2);
    expect(onRateLimit).toHaveBeenCalledWith(1000);

    await vi.advanceTimersByTimeAsync(1000);
    await third;
    expect(onEmbed).toHaveBeenCalledTimes(3);
  });

  it('rejects when the queue is full', async () => {
    const model = createMockEmbeddingModel({ dimensions: 4 });
    const wrapped = wrapEmbeddingModel({
      model,
      middleware: createRateLimitMiddleware({
        maxRequests: 1,
        windowMs: 1000,
        queue: true,
        maxQueueSize: 1,
      }),
    });

    await wrapped.doEmbed({ values: ['a'] });
    const queued = wrapped.doEmbed({ values: ['b'] });
    await vi.advanceTimersByTimeAsync(0);

    await expect(wrapped.doEmbed({ values: ['c'] })).rejects.toThrow('Rate limit queue full');

    await vi.advanceTimersByTimeAsync(1000);
    await expect(queued).resolves.toMatchObject({ embeddings: [expect.any(Float32Array)] });
  });
});

describe('composeVectorDBMiddleware()', () => {
  let db: VectorDB;

  beforeEach(async () => {
    db = await createMemoryDB();
  });

  afterEach(async () => {
    await db.close();
  });

  it('runs beforeAdd hooks in order and persists every transform', async () => {
    const order: string[] = [];
    const middleware1: VectorDBMiddleware = {
      beforeAdd: (doc) => {
        order.push('m1');
        return { ...doc, metadata: { ...doc.metadata, step1: true } };
      },
    };
    const middleware2: VectorDBMiddleware = {
      beforeAdd: (doc) => {
        order.push('m2');
        return { ...doc, metadata: { ...doc.metadata, step2: doc.metadata?.step1 === true } };
      },
    };

    const wrappedDb = wrapVectorDB({ db, middleware: composeVectorDBMiddleware([middleware1, middleware2]) });
    await wrappedDb.add({ id: 'doc-1', vector: unit(0), metadata: {} });

    expect(order).toEqual(['m1', 'm2']);
    expect((await db.get('doc-1'))?.metadata).toEqual({ step1: true, step2: true });
  });

  it('accepts a middleware array directly', async () => {
    const wrappedDb = wrapVectorDB({
      db,
      middleware: [
        { beforeAdd: (doc) => ({ ...doc, metadata: { a: 1 } }) },
        { afterGet: (doc) => doc && { ...doc, metadata: { ...doc.metadata, b: 2 } } },
      ],
    });

    await wrappedDb.add({ id: 'doc-1', vector: unit(0), metadata: {} });

    expect((await wrappedDb.get('doc-1'))?.metadata).toEqual({ a: 1, b: 2 });
  });

  it('nests wrapSearch with the first middleware outermost', async () => {
    const order: string[] = [];
    const outer: VectorDBMiddleware = {
      wrapSearch: async ({ doSearch }) => {
        order.push('outer:before');
        const results = await doSearch();
        order.push('outer:after');
        return results;
      },
    };
    const inner: VectorDBMiddleware = {
      wrapSearch: async ({ doSearch }) => {
        order.push('inner:before');
        const results = await doSearch();
        order.push('inner:after');
        return results.map((r) => ({ ...r, score: 42 }));
      },
    };
    const wrappedDb = wrapVectorDB({ db, middleware: composeVectorDBMiddleware([outer, inner]) });
    await wrappedDb.add({ id: 'doc-1', vector: unit(0), metadata: {} });

    const results = await wrappedDb.search(unit(0));

    expect(order).toEqual(['outer:before', 'inner:before', 'inner:after', 'outer:after']);
    expect(results.map((r) => r.score)).toEqual([42]);
  });

  it('stops a delete when any beforeDelete returns false', async () => {
    const afterDelete = vi.fn();
    const wrappedDb = wrapVectorDB({
      db,
      middleware: composeVectorDBMiddleware([
        { beforeDelete: () => true },
        { beforeDelete: (id) => id !== 'protected' },
        { afterDelete },
      ]),
    });
    await wrappedDb.add({ id: 'protected', vector: unit(0), metadata: {} });

    await wrappedDb.delete('protected');

    expect(await db.get('protected')).not.toBeNull();
    expect(afterDelete).not.toHaveBeenCalled();
  });
});

describe('wrapVectorDB() onError', () => {
  let db: VectorDB;

  beforeEach(async () => {
    db = await createMemoryDB();
  });

  afterEach(async () => {
    await db.close();
  });

  const hookFailure = (operation: string) => () => {
    throw new Error(`${operation} hook failed`);
  };

  const failingMiddleware: VectorDBMiddleware = {
    wrapGet: hookFailure('get'),
    beforeDelete: hookFailure('delete'),
    afterDeleteWhere: hookFailure('deleteWhere'),
    beforeClear: hookFailure('clear'),
  };

  it('suppresses errors with a neutral result per operation when onError returns true', async () => {
    const seen: Array<[string, string]> = [];
    const wrappedDb = wrapVectorDB({
      db,
      middleware: {
        ...failingMiddleware,
        onError: (error, operation) => {
          seen.push([operation, error.message]);
          return true;
        },
      },
    });

    await expect(wrappedDb.add({ id: 'a', vector: new Float32Array(3), metadata: {} })).resolves.toBeUndefined();
    await expect(
      wrappedDb.addMany([{ id: 'b', vector: new Float32Array(3), metadata: {} }])
    ).resolves.toBeUndefined();
    await expect(wrappedDb.get('a')).resolves.toBeNull();
    await expect(wrappedDb.update('missing', { metadata: {} })).resolves.toBeUndefined();
    await expect(wrappedDb.delete('a')).resolves.toBeUndefined();
    await expect(wrappedDb.deleteMany(['a'])).resolves.toBeUndefined();
    await expect(wrappedDb.deleteWhere({})).resolves.toBe(0);
    await expect(wrappedDb.search(new Float32Array(3))).resolves.toEqual([]);
    await expect(wrappedDb.clear()).resolves.toBeUndefined();
    await expect(wrappedDb.import(new Blob(['not json']))).resolves.toBeUndefined();

    expect(seen.map(([op]) => op)).toEqual([
      'add',
      'addMany',
      'get',
      'update',
      'delete',
      'deleteMany',
      'deleteWhere',
      'search',
      'clear',
      'import',
    ]);
    expect(seen[0][1]).toMatch(/dimension mismatch/i);
    expect(seen[3][1]).toBe('Document not found: missing');
    expect(seen[7][1]).toMatch(/Query vector dimension mismatch/);
    expect((await db.stats()).count).toBe(0);
  });

  it('suppresses when any composed middleware returns true', async () => {
    const first = vi.fn(() => false);
    const wrappedDb = wrapVectorDB({ db, middleware: [{ onError: first }, { onError: async () => true }] });

    await expect(wrappedDb.search(new Float32Array(3))).resolves.toEqual([]);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['returns false', () => false],
    ['returns nothing', () => undefined],
  ])('rethrows the original error when onError %s', async (_label, handler) => {
    const onError = vi.fn(handler);
    const wrappedDb = wrapVectorDB({ db, middleware: { ...failingMiddleware, onError } });

    await expect(wrappedDb.add({ id: 'a', vector: new Float32Array(3), metadata: {} })).rejects.toThrow(
      /dimension mismatch/i
    );
    await expect(wrappedDb.get('a')).rejects.toThrow('get hook failed');
    await expect(wrappedDb.deleteWhere({})).rejects.toThrow('deleteWhere hook failed');
    await expect(wrappedDb.search(new Float32Array(3))).rejects.toThrow(/Query vector dimension mismatch/);
    await expect(wrappedDb.update('missing', { metadata: {} })).rejects.toThrow('Document not found: missing');

    expect(onError.mock.calls.map(([, op]) => op)).toEqual(['add', 'get', 'deleteWhere', 'search', 'update']);
  });
});
