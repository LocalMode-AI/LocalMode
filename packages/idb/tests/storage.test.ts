/**
 * @fileoverview Tests for IDBStorage — mirrors dexie/tests/storage.test.ts
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IDBStorage } from '../src/index.js';
import type { StorageAdapter } from '@localmode/core';

let testCounter = 0;

describe('IDBStorage', () => {
  let storage: IDBStorage;

  beforeEach(async () => {
    storage = new IDBStorage({ name: `test-${Date.now()}-${testCounter++}` });
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

  describe('vector payload types (SQ8/PQ compression)', () => {
    it('preserves Uint8Array payloads through addVector/getVector/getAllVectors', async () => {
      // 5 bytes — deliberately NOT divisible by 4, so any f32 reinterpretation
      // throws or corrupts instead of passing accidentally.
      const compressed = new Uint8Array([7, 0, 255, 128, 3]);
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

    it('reads legacy records (raw ArrayBuffer of f32 data) as Float32Array', async () => {
      // Simulate a database written by a previous version of this package,
      // which stored vectors as raw ArrayBuffers of f32 data. The fixture is
      // injected at the IDB store level (no public API can produce a legacy
      // record); the assertions go through the public getVector()/
      // getAllVectors() API.
      const legacy = new Float32Array([4.5, -1.25]);
      const internalDb = (
        storage as unknown as {
          db: { put(store: string, record: unknown): Promise<unknown> };
        }
      ).db;
      await internalDb.put('vectors', {
        id: 'v-legacy',
        collectionId: 'default',
        vector: legacy.buffer.slice(0),
      });

      const result = await storage.getVector('v-legacy');
      expect(result).toBeInstanceOf(Float32Array);
      expect(Array.from(result as Float32Array)).toEqual([4.5, -1.25]);

      const all = await storage.getAllVectors('default');
      expect(all.get('v-legacy')).toBeInstanceOf(Float32Array);
      expect(Array.from(all.get('v-legacy') as Float32Array)).toEqual([4.5, -1.25]);
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
      const customStorage = new IDBStorage({ name: `integration-${Date.now()}-${testCounter++}` });

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

    it('round-trips SQ8-compressed vectors (Uint8Array payloads) through this adapter', async () => {
      const { createVectorDB } = await import('@localmode/core');
      const customStorage = new IDBStorage({ name: `integration-sq8-${Date.now()}-${testCounter++}` });

      const db = await createVectorDB({
        name: 'integration-sq8',
        dimensions: 32,
        storage: customStorage,
        compression: { type: 'sq8' },
      });

      const original = new Float32Array(Array.from({ length: 32 }, (_, j) => Math.sin(j * 0.7)));
      await db.addMany(
        Array.from({ length: 20 }, (_, i) => ({
          id: `doc${i}`,
          vector: new Float32Array(Array.from({ length: 32 }, (_, j) => Math.sin(i + j * 0.7))),
        }))
      );
      await db.add({ id: 'probe', vector: original });

      // Witness 1 (public API): the vector decompresses back to floats with
      // high fidelity.
      const result = await db.get('probe');
      expect(result).not.toBeNull();
      expect(result!.vector).toBeInstanceOf(Float32Array);
      let dot = 0;
      let na = 0;
      let nb = 0;
      for (let j = 0; j < 32; j++) {
        dot += original[j] * result!.vector[j];
        na += original[j] ** 2;
        nb += result!.vector[j] ** 2;
      }
      expect(dot / Math.sqrt(na * nb)).toBeGreaterThan(0.99);

      // Witness 2 (storage level): the adapter actually persisted a
      // compressed Uint8Array payload — compression really engaged through
      // this adapter rather than silently writing floats.
      const stored = await customStorage.getVector('probe');
      expect(stored).toBeInstanceOf(Uint8Array);

      await db.close();
    });
  });
});
