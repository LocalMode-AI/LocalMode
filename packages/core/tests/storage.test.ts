/**
 * @fileoverview Tests for storage quota, cleanup, and storage implementations
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MemoryStorage,
  IndexedDBStorage,
  createStorage,
  getStorageQuota,
  checkQuotaWithWarnings,
  requestPersistence,
  cleanup,
  estimateCleanupSize,
} from '../src/index.js';
import type { StorageAdapter } from '../src/index.js';

describe('StorageAdapter interface', () => {
  it('IndexedDBStorage satisfies StorageAdapter', () => {
    // Compile-time check: assigning IndexedDBStorage to StorageAdapter must not error
    const _check: StorageAdapter = {} as IndexedDBStorage;
    expect(_check).toBeDefined();
  });

  it('MemoryStorage satisfies StorageAdapter', () => {
    // Compile-time check: assigning MemoryStorage to StorageAdapter must not error
    const _check: StorageAdapter = {} as MemoryStorage;
    expect(_check).toBeDefined();
  });
});

describe('MemoryStorage', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  afterEach(async () => {
    await storage.close();
  });

  describe('addDocument() and getDocument()', () => {
    it('returns null for non-existent document', async () => {
      const result = await storage.getDocument('non-existent');
      expect(result).toBeNull();
    });

    it('stores and retrieves document', async () => {
      const doc = { id: 'test', collectionId: 'default', metadata: {}, createdAt: Date.now(), updatedAt: Date.now() };
      await storage.addDocument(doc);

      const result = await storage.getDocument('test');
      expect(result).toEqual(doc);
    });

    it('overwrites existing document', async () => {
      const doc1 = { id: 'test', collectionId: 'default', metadata: { version: 1 }, createdAt: Date.now(), updatedAt: Date.now() };
      const doc2 = { id: 'test', collectionId: 'default', metadata: { version: 2 }, createdAt: Date.now(), updatedAt: Date.now() };
      
      await storage.addDocument(doc1);
      await storage.addDocument(doc2);

      const result = await storage.getDocument('test');
      expect(result?.metadata.version).toBe(2);
    });
  });

  describe('deleteDocument()', () => {
    it('removes existing document', async () => {
      const doc = { id: 'test', collectionId: 'default', metadata: {}, createdAt: Date.now(), updatedAt: Date.now() };
      await storage.addDocument(doc);
      await storage.deleteDocument('test');

      const result = await storage.getDocument('test');
      expect(result).toBeNull();
    });

    it('does not throw for non-existent document', async () => {
      await expect(storage.deleteDocument('non-existent')).resolves.not.toThrow();
    });
  });

  describe('getAllDocuments()', () => {
    it('returns empty array initially', async () => {
      const docs = await storage.getAllDocuments('default');
      expect(docs).toEqual([]);
    });

    it('returns all documents in collection', async () => {
      const doc1 = { id: 'doc1', collectionId: 'default', metadata: {}, createdAt: Date.now(), updatedAt: Date.now() };
      const doc2 = { id: 'doc2', collectionId: 'default', metadata: {}, createdAt: Date.now(), updatedAt: Date.now() };
      const doc3 = { id: 'doc3', collectionId: 'other', metadata: {}, createdAt: Date.now(), updatedAt: Date.now() };
      
      await storage.addDocument(doc1);
      await storage.addDocument(doc2);
      await storage.addDocument(doc3);

      const docs = await storage.getAllDocuments('default');
      expect(docs.length).toBe(2);
      expect(docs.map(d => d.id).sort()).toEqual(['doc1', 'doc2']);
    });
  });

  describe('clear()', () => {
    it('removes all data', async () => {
      const doc = { id: 'test', collectionId: 'default', metadata: {}, createdAt: Date.now(), updatedAt: Date.now() };
      await storage.addDocument(doc);

      await storage.clear();

      const docs = await storage.getAllDocuments('default');
      expect(docs).toEqual([]);
    });
  });

  describe('countDocuments()', () => {
    it('returns 0 initially', async () => {
      const count = await storage.countDocuments('default');
      expect(count).toBe(0);
    });

    it('returns correct count', async () => {
      const doc1 = { id: 'doc1', collectionId: 'default', metadata: {}, createdAt: Date.now(), updatedAt: Date.now() };
      const doc2 = { id: 'doc2', collectionId: 'default', metadata: {}, createdAt: Date.now(), updatedAt: Date.now() };

      await storage.addDocument(doc1);
      await storage.addDocument(doc2);

      const count = await storage.countDocuments('default');
      expect(count).toBe(2);
    });
  });

  describe('vector payload types (SQ8/PQ compression)', () => {
    // Canonical behavior all StorageAdapter implementations must mirror:
    // Uint8Array payloads (compressed vectors) round-trip with their type
    // and bytes intact; Float32Array stays Float32Array.
    it('preserves Uint8Array payloads through addVector/getVector/getAllVectors', async () => {
      const compressed = new Uint8Array([7, 0, 255, 128, 3]); // length not divisible by 4
      await storage.addVector({ id: 'v-u8', collectionId: 'default', vector: compressed });
      await storage.addVector({ id: 'v-f32', collectionId: 'default', vector: new Float32Array([1.5, -2.5]) });

      const u8 = await storage.getVector('v-u8');
      expect(u8).toBeInstanceOf(Uint8Array);
      expect(Array.from(u8 as Uint8Array)).toEqual([7, 0, 255, 128, 3]);

      const f32 = await storage.getVector('v-f32');
      expect(f32).toBeInstanceOf(Float32Array);
      expect(Array.from(f32 as Float32Array)).toEqual([1.5, -2.5]);

      const all = await storage.getAllVectors('default');
      expect(all.get('v-u8')).toBeInstanceOf(Uint8Array);
      expect(Array.from(all.get('v-u8') as Uint8Array)).toEqual([7, 0, 255, 128, 3]);
      expect(all.get('v-f32')).toBeInstanceOf(Float32Array);
    });

    it('mutating the input after addVector does not affect the stored copy', async () => {
      const compressed = new Uint8Array([1, 2, 3, 4, 5]);
      await storage.addVector({ id: 'v-mut', collectionId: 'default', vector: compressed });
      compressed[0] = 99;

      const stored = await storage.getVector('v-mut');
      expect(Array.from(stored as Uint8Array)).toEqual([1, 2, 3, 4, 5]);
    });
  });
});

describe('createStorage()', () => {
  it('creates memory storage when type is memory', async () => {
    const storage = createStorage('memory', 'test');
    expect(storage).toBeInstanceOf(MemoryStorage);
    await storage.close();
  });

  it('creates indexeddb storage when type is indexeddb', async () => {
    const storage = createStorage('indexeddb', 'test');
    expect(storage).toBeInstanceOf(IndexedDBStorage);
    await storage.close();
  });
});

describe('Storage Quota', () => {
  // getStorageQuota() reads navigator.storage.estimate(). jsdom ships no
  // StorageManager, so the browser API itself is installed for the duration of
  // a test and removed afterwards. Only that boundary is substituted:
  // getStorageQuota() and checkQuotaWithWarnings() run unmodified.
  let storageInstalled = false;

  function installStorage(storage: Record<string, unknown>): void {
    Object.defineProperty(navigator, 'storage', { configurable: true, value: storage });
    storageInstalled = true;
  }

  function installEstimate(usage: number, quota: number, persisted = false): void {
    installStorage({
      estimate: async () => ({ usage, quota }),
      persisted: async () => persisted,
    });
  }

  afterEach(() => {
    if (storageInstalled) {
      Reflect.deleteProperty(navigator, 'storage');
      storageInstalled = false;
    }
  });

  describe('getStorageQuota()', () => {
    it('returns null when the Storage API is unavailable', async () => {
      expect((navigator as { storage?: unknown }).storage).toBeUndefined();

      await expect(getStorageQuota()).resolves.toBeNull();
    });

    it('reports usage, quota and the derived fields from the Storage API', async () => {
      installEstimate(250, 1000, true);

      const quota = await getStorageQuota();

      expect(quota).toEqual({
        usedBytes: 250,
        quotaBytes: 1000,
        percentUsed: 25,
        isPersisted: true,
        availableBytes: 750,
      });
    });

    it('reports 0% and no available bytes when the browser reports no quota', async () => {
      installEstimate(0, 0);

      const quota = await getStorageQuota();

      expect(quota?.percentUsed).toBe(0);
      expect(quota?.availableBytes).toBe(0);
    });

    it('returns null when the Storage API throws', async () => {
      installStorage({
        estimate: async () => {
          throw new Error('estimate denied');
        },
      });

      await expect(getStorageQuota()).resolves.toBeNull();
    });
  });

  describe('checkQuotaWithWarnings()', () => {
    it("returns 'ok' and calls neither callback below the warning threshold", async () => {
      installEstimate(500, 1000);
      const onWarning = vi.fn();
      const onCritical = vi.fn();

      const status = await checkQuotaWithWarnings({
        warnAt: 80,
        criticalAt: 95,
        onWarning,
        onCritical,
      });

      expect(status).toBe('ok');
      expect(onWarning).not.toHaveBeenCalled();
      expect(onCritical).not.toHaveBeenCalled();
    });

    it('calls onWarning with the quota once usage reaches warnAt', async () => {
      installEstimate(85, 100);
      const onWarning = vi.fn();
      const onCritical = vi.fn();

      const status = await checkQuotaWithWarnings({
        warnAt: 80,
        criticalAt: 95,
        onWarning,
        onCritical,
      });

      expect(status).toBe('warning');
      expect(onWarning).toHaveBeenCalledTimes(1);
      expect(onWarning).toHaveBeenCalledWith(
        expect.objectContaining({ usedBytes: 85, quotaBytes: 100, percentUsed: 85 })
      );
      expect(onCritical).not.toHaveBeenCalled();
    });

    it('calls only onCritical once usage reaches criticalAt', async () => {
      installEstimate(96, 100);
      const onWarning = vi.fn();
      const onCritical = vi.fn();

      const status = await checkQuotaWithWarnings({
        warnAt: 80,
        criticalAt: 95,
        onWarning,
        onCritical,
      });

      expect(status).toBe('critical');
      expect(onCritical).toHaveBeenCalledTimes(1);
      expect(onCritical).toHaveBeenCalledWith(expect.objectContaining({ percentUsed: 96 }));
      expect(onWarning).not.toHaveBeenCalled();
    });

    it('applies the documented default thresholds', async () => {
      installEstimate(81, 100);
      const onWarning = vi.fn();

      const status = await checkQuotaWithWarnings({ onWarning });

      expect(status).toBe('warning');
      expect(onWarning).toHaveBeenCalledTimes(1);
    });

    it("returns 'ok' without calling back when the Storage API is unavailable", async () => {
      const onWarning = vi.fn();

      const status = await checkQuotaWithWarnings({ warnAt: 1, onWarning });

      expect(status).toBe('ok');
      expect(onWarning).not.toHaveBeenCalled();
    });
  });

  describe('requestPersistence()', () => {
    it('returns false when the Storage API is unavailable', async () => {
      await expect(requestPersistence()).resolves.toBe(false);
    });

    it('returns what the browser grants', async () => {
      installStorage({ persist: async () => true });

      await expect(requestPersistence()).resolves.toBe(true);
    });

    it('returns false when the persist request throws', async () => {
      installStorage({
        persist: async () => {
          throw new Error('persist denied');
        },
      });

      await expect(requestPersistence()).resolves.toBe(false);
    });
  });
});

describe('cleanup()', () => {
  const DAY = 24 * 60 * 60 * 1000;

  // An in-memory CleanupableDB: documents with creation times, plus a record
  // of every deleteMany() batch.
  function createCleanupableDB(ages: Array<{ id: string; ageDays: number; sizeBytes?: number }>) {
    const now = Date.now();
    const docs = new Map(
      ages.map((d) => [d.id, { id: d.id, createdAt: now - d.ageDays * DAY, sizeBytes: d.sizeBytes }])
    );
    const batches: string[][] = [];
    return {
      batches,
      remaining: () => [...docs.keys()].sort(),
      async getDocumentsWithTimestamps() {
        return [...docs.values()].map((d) => ({ ...d }));
      },
      async deleteMany(ids: string[]) {
        batches.push(ids);
        for (const id of ids) docs.delete(id);
      },
      async count() {
        return docs.size;
      },
    };
  }

  it('deletes documents older than maxAge', async () => {
    const db = createCleanupableDB([
      { id: 'old', ageDays: 40, sizeBytes: 500 },
      { id: 'mid', ageDays: 10, sizeBytes: 500 },
      { id: 'new', ageDays: 1, sizeBytes: 500 },
    ]);

    const result = await cleanup(db, { maxAge: '30d' });

    expect(result.deletedCount).toBe(1);
    expect(result.freedBytes).toBe(500);
    expect(db.remaining()).toEqual(['mid', 'new']);
  });

  it('keeps the newest keepMinCount documents even when they are too old', async () => {
    const db = createCleanupableDB([
      { id: 'a', ageDays: 50 },
      { id: 'b', ageDays: 40 },
      { id: 'c', ageDays: 35 },
    ]);

    const result = await cleanup(db, { maxAge: '30d', keepMinCount: 2 });

    expect(result.deletedCount).toBe(1);
    expect(result.freedBytes).toBe(1024); // 1 KB estimate when size is unknown
    expect(db.remaining()).toEqual(['b', 'c']);
  });

  it('reports without deleting on a dry run, and estimateCleanupSize() matches it', async () => {
    const db = createCleanupableDB([
      { id: 'a', ageDays: 10, sizeBytes: 100 },
      { id: 'b', ageDays: 9, sizeBytes: 200 },
      { id: 'c', ageDays: 1, sizeBytes: 300 },
      { id: 'd', ageDays: 0, sizeBytes: 400 },
    ]);

    const dry = await cleanup(db, { maxAge: '7d', dryRun: true });
    const estimate = await estimateCleanupSize(db, { maxAge: '7d' });

    expect(dry.deletedIds).toEqual(['a', 'b']);
    expect(dry.deletedCount).toBe(2);
    expect(dry.freedBytes).toBe(300);
    expect(db.batches).toEqual([]);
    expect(estimate).toEqual({ documentCount: 2, estimatedBytes: 300, percentageOfTotal: 50 });
  });

  it('removes the oldest share for targetUsagePercent, in batches, reporting progress', async () => {
    const db = createCleanupableDB(
      Array.from({ length: 10 }, (_, i) => ({ id: `doc-${i}`, ageDays: 10 - i }))
    );
    const phases: string[] = [];

    const result = await cleanup(db, {
      targetUsagePercent: 70,
      batchSize: 2,
      onProgress: (p) => phases.push(`${p.phase}:${p.deletedCount}`),
    });

    expect(result.deletedCount).toBe(3);
    expect(db.batches).toEqual([['doc-0', 'doc-1'], ['doc-2']]);
    expect(phases).toEqual(['analyzing:0', 'deleting:2', 'deleting:3', 'complete:3']);
  });

  it('rejects an invalid maxAge', async () => {
    const db = createCleanupableDB([{ id: 'a', ageDays: 1 }]);

    await expect(cleanup(db, { maxAge: 'soon' })).rejects.toThrow('Invalid duration format: "soon"');
    expect(db.remaining()).toEqual(['a']);
  });
});

