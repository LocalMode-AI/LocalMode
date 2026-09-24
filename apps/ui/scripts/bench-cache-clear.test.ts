/**
 * Which storage the "Clear model caches" action may delete: only the stores
 * the page's model providers create for the origin. The bench's own
 * crash-recovery database and anything else on the origin (the service
 * worker's caches, other apps' databases) must survive. The deletion itself
 * runs against real browser storage in the bench e2e spec.
 */
import { describe, expect, it } from 'vitest';
import {
  BENCH_PROGRESS_DB,
  describeClearReport,
  isProviderStorageEmpty,
  selectProviderCacheNames,
  selectProviderIndexedDBNames,
  type CacheClearReport,
} from '../src/lib/bench/cache-clear';

describe('provider storage selection', () => {
  it('selects the Transformers.js, WebLLM and LiteRT Cache API caches and nothing else', () => {
    expect(
      selectProviderCacheNames([
        'transformers-cache',
        'webllm/model',
        'webllm/config',
        'webllm/wasm',
        'litert-models',
        'serwist-precache-v2-http://localhost:3000/',
        'next-static-js-assets',
        'my-transformers-cache-backup',
        'webllm',
      ]),
    ).toEqual(['transformers-cache', 'webllm/model', 'webllm/config', 'webllm/wasm', 'litert-models']);
  });

  it("selects WebLLM's IndexedDB caches and never the bench's own progress database", () => {
    expect(
      selectProviderIndexedDBNames(['webllm/model', 'webllm/config', BENCH_PROGRESS_DB, 'privacy-vault', 'localmode-vectors']),
    ).toEqual(['webllm/model', 'webllm/config']);
    expect(BENCH_PROGRESS_DB).toBe('localmode-bench-progress');
  });

  it('treats empty provider caches as empty storage and any model file as not', () => {
    const empty = { caches: [{ name: 'transformers-cache', entries: 0 }], indexedDB: [], opfs: [] };
    expect(isProviderStorageEmpty(empty)).toBe(true);
    expect(isProviderStorageEmpty({ ...empty, caches: [{ name: 'webllm/model', entries: 3 }] })).toBe(false);
    expect(isProviderStorageEmpty({ ...empty, indexedDB: ['webllm/model'] })).toBe(false);
    expect(isProviderStorageEmpty({ ...empty, opfs: [{ name: 'abc.gguf', bytes: 1 }] })).toBe(false);
  });
});

describe('clear report', () => {
  it('names what was deleted, the bytes freed, and what the page cannot clear', () => {
    const report: CacheClearReport = {
      ok: true,
      clearedAt: '2026-09-23T10:00:00.000Z',
      deleted: {
        caches: [{ name: 'transformers-cache', entries: 12 }],
        indexedDB: [],
        opfs: [{ name: 'f1', bytes: 105_000_000 }],
      },
      usageBeforeBytes: 400 * 1024 * 1024,
      usageAfterBytes: 10 * 1024 * 1024,
      errors: [],
    };
    const lines = describeClearReport(report);
    expect(lines).toEqual([
      'Cache API: transformers-cache (12 files)',
      'Origin Private File System (wllama): 1 model file, 100 MB',
      'IndexedDB: no provider databases found',
      'Storage used by this site: 400 MB before, 10 MB after (390 MB freed). The browser can keep counting deleted Cache API space for a while before it reclaims it.',
    ]);
  });

  it('says so when there was nothing to delete and reports errors verbatim', () => {
    const lines = describeClearReport({
      ok: false,
      clearedAt: '2026-09-23T10:00:00.000Z',
      deleted: { caches: [], indexedDB: [], opfs: [] },
      errors: ['IndexedDB webllm/model: delete blocked by an open connection'],
    });
    expect(lines).toEqual([
      'Cache API: no provider caches found',
      'Origin Private File System (wllama): no model files found',
      'IndexedDB: no provider databases found',
      'Error: IndexedDB webllm/model: delete blocked by an open connection',
    ]);
  });
});
