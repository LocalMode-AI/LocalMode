/**
 * @fileoverview Tests for DexieStorage — mirrors core/tests/storage.test.ts
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DexieStorage } from '../src/index.js';
import type { StorageAdapter } from '@localmode/core';

describe('DexieStorage', () => {
  let storage: DexieStorage;

  beforeEach(async () => {
    storage = new DexieStorage({ name: `test-${Date.now()}` });
    await storage.open();
  });

  afterEach(async () => {
    await storage.close();
  });

  it('implements StorageAdapter', () => {
    const _check: StorageAdapter = storage;
    expect(_check).toBeDefined();
  });

  describe('addDocument() and getDocument()', () => {
    it('returns null for non-existent document', async () => {
      const result = await storage.getDocument('non-existent');
      expect(result).toBeNull();
    });

    it('stores and retrieves document', async () => {
      const doc = {
        id: 'test',
        collectionId: 'default',
        metadata: { title: 'Hello' },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await storage.addDocument(doc);

      const result = await storage.getDocument('test');
      expect(result).toEqual(doc);
    });

    it('overwrites existing document', async () => {
      const doc1 = {
        id: 'test',
        collectionId: 'default',
        metadata: { version: 1 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const doc2 = {
        id: 'test',
        collectionId: 'default',
        metadata: { version: 2 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await storage.addDocument(doc1);
      await storage.addDocument(doc2);

      const result = await storage.getDocument('test');
      expect(result?.metadata?.version).toBe(2);
    });
  });

  describe('deleteDocument()', () => {
    it('removes existing document', async () => {
      const doc = {
        id: 'test',
        collectionId: 'default',
        metadata: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
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
      const now = Date.now();
      await storage.addDocument({ id: 'doc1', collectionId: 'default', metadata: {}, createdAt: now, updatedAt: now });
      await storage.addDocument({ id: 'doc2', collectionId: 'default', metadata: {}, createdAt: now, updatedAt: now });
      await storage.addDocument({ id: 'doc3', collectionId: 'other', metadata: {}, createdAt: now, updatedAt: now });

      const docs = await storage.getAllDocuments('default');
      expect(docs.length).toBe(2);
      expect(docs.map((d) => d.id).sort()).toEqual(['doc1', 'doc2']);
    });
  });

  describe('countDocuments()', () => {
    it('returns 0 initially', async () => {
      const count = await storage.countDocuments('default');
      expect(count).toBe(0);
    });

    it('returns correct count', async () => {
      const now = Date.now();
      await storage.addDocument({ id: 'doc1', collectionId: 'default', metadata: {}, createdAt: now, updatedAt: now });
      await storage.addDocument({ id: 'doc2', collectionId: 'default', metadata: {}, createdAt: now, updatedAt: now });

      const count = await storage.countDocuments('default');
      expect(count).toBe(2);
    });
  });

  describe('addVector() and getVector()', () => {
    it('returns null for non-existent vector', async () => {
      const result = await storage.getVector('non-existent');
      expect(result).toBeNull();
    });

    it('stores and retrieves vector as Float32Array', async () => {
      const vec = new Float32Array([1.0, 2.0, 3.0]);
      await storage.addVector({ id: 'v1', collectionId: 'default', vector: vec });

      const result = await storage.getVector('v1');
      expect(result).toBeInstanceOf(Float32Array);
      expect(Array.from(result!)).toEqual([1.0, 2.0, 3.0]);
    });
  });

  describe('getAllVectors()', () => {
    it('returns empty Map initially', async () => {
      const vecs = await storage.getAllVectors('default');
      expect(vecs.size).toBe(0);
    });

    it('returns Map filtered by collection', async () => {
      await storage.addVector({ id: 'v1', collectionId: 'col1', vector: new Float32Array([1]) });
      await storage.addVector({ id: 'v2', collectionId: 'col1', vector: new Float32Array([2]) });
      await storage.addVector({ id: 'v3', collectionId: 'col2', vector: new Float32Array([3]) });

      const vecs = await storage.getAllVectors('col1');
      expect(vecs).toBeInstanceOf(Map);
      expect(vecs.size).toBe(2);
      expect(Array.from(vecs.get('v1')!)).toEqual([1]);
      expect(Array.from(vecs.get('v2')!)).toEqual([2]);
    });
  });

  describe('deleteVector()', () => {
    it('removes a vector', async () => {
      await storage.addVector({ id: 'v1', collectionId: 'default', vector: new Float32Array([1]) });
      await storage.deleteVector('v1');

      const result = await storage.getVector('v1');
      expect(result).toBeNull();
    });
  });

  describe('saveIndex() and loadIndex()', () => {
    const mockIndex = {
      version: 1,
      dimensions: 3,
      m: 16,
      efConstruction: 200,
      entryPointId: 'entry1',
      maxLevel: 2,
      nodes: [{ id: 'n1', level: 0, connections: [[0, ['n2']]] as [number, string[]][] }],
    };

    it('returns null for non-existent index', async () => {
      const result = await storage.loadIndex('non-existent');
      expect(result).toBeNull();
    });

    it('saves and loads index', async () => {
      await storage.saveIndex('col1', mockIndex);
      const result = await storage.loadIndex('col1');
      expect(result).toEqual(mockIndex);
    });

    it('overwrites existing index', async () => {
      await storage.saveIndex('col1', mockIndex);
      const updated = { ...mockIndex, maxLevel: 5 };
      await storage.saveIndex('col1', updated);

      const result = await storage.loadIndex('col1');
      expect(result?.maxLevel).toBe(5);
    });
  });

  describe('deleteIndex()', () => {
    it('removes an index', async () => {
      const mockIndex = { version: 1, dimensions: 3, m: 16, efConstruction: 200, entryPointId: null, maxLevel: 0, nodes: [] };
      await storage.saveIndex('col1', mockIndex);
      await storage.deleteIndex('col1');

      const result = await storage.loadIndex('col1');
      expect(result).toBeNull();
    });
  });

  describe('Collection operations', () => {
    const col = { id: 'c1', name: 'docs', dimensions: 384, createdAt: Date.now() };

    it('creates and gets collection by ID', async () => {
      await storage.createCollection(col);
      const result = await storage.getCollection('c1');
      expect(result).toEqual(col);
    });

    it('returns null for non-existent collection', async () => {
      expect(await storage.getCollection('nope')).toBeNull();
    });

    it('gets collection by name', async () => {
      await storage.createCollection(col);
      const result = await storage.getCollectionByName('docs');
      expect(result).toEqual(col);
    });

    it('returns null for non-existent collection name', async () => {
      expect(await storage.getCollectionByName('nope')).toBeNull();
    });

    it('gets all collections', async () => {
      await storage.createCollection(col);
      await storage.createCollection({ id: 'c2', name: 'images', dimensions: 512, createdAt: Date.now() });

      const all = await storage.getAllCollections();
      expect(all.length).toBe(2);
    });

    it('deletes collection', async () => {
      await storage.createCollection(col);
      await storage.deleteCollection('c1');
      expect(await storage.getCollection('c1')).toBeNull();
    });
  });

  describe('clear()', () => {
    it('removes all data', async () => {
      const now = Date.now();
      await storage.addDocument({ id: 'doc1', collectionId: 'default', metadata: {}, createdAt: now, updatedAt: now });
      await storage.addVector({ id: 'doc1', collectionId: 'default', vector: new Float32Array([1]) });
      await storage.createCollection({ id: 'c1', name: 'test', dimensions: 3, createdAt: now });

      await storage.clear();

      expect(await storage.getAllDocuments('default')).toEqual([]);
      expect(await storage.getAllVectors('default')).toEqual(new Map());
      expect(await storage.getAllCollections()).toEqual([]);
    });
  });

  describe('clearCollection()', () => {
    it('removes only target collection data', async () => {
      const now = Date.now();
      await storage.addDocument({ id: 'doc1', collectionId: 'col1', metadata: {}, createdAt: now, updatedAt: now });
      await storage.addDocument({ id: 'doc2', collectionId: 'col2', metadata: {}, createdAt: now, updatedAt: now });
      await storage.addVector({ id: 'doc1', collectionId: 'col1', vector: new Float32Array([1]) });
      await storage.addVector({ id: 'doc2', collectionId: 'col2', vector: new Float32Array([2]) });

      await storage.clearCollection('col1');

      expect(await storage.getAllDocuments('col1')).toEqual([]);
      expect(await storage.getAllVectors('col1')).toEqual(new Map());
      // col2 data remains
      expect((await storage.getAllDocuments('col2')).length).toBe(1);
      expect((await storage.getAllVectors('col2')).size).toBe(1);
    });
  });

  describe('estimateSize()', () => {
    it('returns a number', async () => {
      const size = await storage.estimateSize();
      expect(typeof size).toBe('number');
    });
  });

  describe('createVectorDB integration', () => {
    it('works as custom storage with createVectorDB', async () => {
      const { createVectorDB } = await import('@localmode/core');
      const customStorage = new DexieStorage({ name: `integration-${Date.now()}` });

      const db = await createVectorDB({
        name: 'integration-test',
        dimensions: 3,
        storage: customStorage,
      });

      await db.add({
        id: 'doc1',
        vector: new Float32Array([1, 2, 3]),
        metadata: { title: 'Test' },
      });

      const result = await db.get('doc1');
      expect(result).not.toBeNull();
      expect(result!.metadata?.title).toBe('Test');

      await db.close();
    });
  });
});
