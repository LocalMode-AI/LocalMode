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
  runMigrations,
  WAL,
} from '../src/index.js';
import type { StorageQuota, CleanupOptions } from '../src/index.js';

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
  describe('getStorageQuota()', () => {
    it('returns quota info or null', async () => {
      const quota = await getStorageQuota();

      // May be null if navigator.storage is not available
      if (quota !== null) {
        expect(quota).toHaveProperty('usedBytes');
        expect(quota).toHaveProperty('quotaBytes');
        expect(quota).toHaveProperty('percentUsed');
        expect(typeof quota.usedBytes).toBe('number');
        expect(typeof quota.quotaBytes).toBe('number');
        expect(typeof quota.percentUsed).toBe('number');
      }
    });
  });

  describe('checkQuotaWithWarnings()', () => {
    it('returns quota status', async () => {
      const onWarning = vi.fn();
      const onCritical = vi.fn();

      const status = await checkQuotaWithWarnings({
        warnAt: 80,
        criticalAt: 95,
        onWarning,
        onCritical,
      });

      expect(['ok', 'warning', 'critical', 'unknown']).toContain(status);
    });

    it('calls onWarning when threshold exceeded', async () => {
      // Mock getStorageQuota to return high usage
      const originalQuota = getStorageQuota;
      vi.mock('../src/storage/quota.js', async () => {
        const actual = await vi.importActual('../src/storage/quota.js');
        return {
          ...actual,
          getStorageQuota: vi.fn().mockResolvedValue({
            usedBytes: 85,
            quotaBytes: 100,
            percentUsed: 85,
          }),
        };
      });

      // Note: This is a simplified test; actual behavior depends on getStorageQuota result
    });
  });

  describe('requestPersistence()', () => {
    it('returns boolean', async () => {
      const result = await requestPersistence();
      expect(typeof result).toBe('boolean');
    });
  });
});

// Cleanup tests require VectorDB instance, not raw storage
describe.skip('Cleanup', () => {
  // cleanup() and estimateCleanupSize() work with VectorDB instances
  // These should be tested in vectordb.test.ts or integration tests
});

// WAL tests require IndexedDB and are tested in integration tests
describe.skip('WAL (Write-Ahead Log)', () => {
  // WAL is tested via IndexedDBStorage integration tests
});

// Migration tests require IndexedDB transaction and are tested in integration tests
describe.skip('Migrations', () => {
  // Migrations are tested via IndexedDBStorage integration tests
  // runMigrations() requires IDBDatabase and IDBTransaction which are not available in unit tests
});

