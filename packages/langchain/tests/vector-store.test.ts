/**
 * @file vector-store.test.ts
 * @description Tests for LocalModeVectorStore adapter
 */

import { describe, it, expect, vi } from 'vitest';
import { Document } from '@langchain/core/documents';
import { createMockEmbeddingModel } from '@localmode/core';
import { LocalModeEmbeddings } from '../src/embeddings.js';
import { LocalModeVectorStore } from '../src/vector-store.js';

function createMockVectorDB() {
  const storage = new Map<string, { id: string; vector: Float32Array; metadata: Record<string, unknown> }>();

  return {
    addMany: vi.fn(async (docs: Array<{ id: string; vector: Float32Array; metadata: Record<string, unknown> }>) => {
      for (const doc of docs) {
        storage.set(doc.id, doc);
      }
    }),
    search: vi.fn(async (_vector: Float32Array, opts: { k: number }) => {
      const results = Array.from(storage.values()).slice(0, opts.k);
      return results.map((doc, i) => ({
        id: doc.id,
        score: 1 - i * 0.1,
        metadata: doc.metadata,
      }));
    }),
    add: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
    clear: vi.fn(),
    close: vi.fn(),
    count: vi.fn(async () => storage.size),
  };
}

describe('LocalModeVectorStore', () => {
  const mockModel = createMockEmbeddingModel({ dimensions: 4 });
  const embeddings = new LocalModeEmbeddings({ model: mockModel });

  it('addDocuments embeds and stores with generated IDs', async () => {
    const db = createMockVectorDB();
    const store = new LocalModeVectorStore(embeddings, { db: db as any });

    const ids = await store.addDocuments([
      new Document({ pageContent: 'hello', metadata: { source: 'test' } }),
      new Document({ pageContent: 'world', metadata: { source: 'test' } }),
    ]);

    expect(ids).toHaveLength(2);
    expect(db.addMany).toHaveBeenCalledOnce();
    const storedDocs = db.addMany.mock.calls[0][0];
    expect(storedDocs[0].vector).toBeInstanceOf(Float32Array);
    expect(storedDocs[0].metadata.text).toBe('hello');
    expect(storedDocs[0].metadata.source).toBe('test');
  });

  it('addVectors stores without embedding', async () => {
    const db = createMockVectorDB();
    const store = new LocalModeVectorStore(embeddings, { db: db as any });

    const vectors = [[0.1, 0.2, 0.3, 0.4], [0.5, 0.6, 0.7, 0.8]];
    const docs = [
      new Document({ pageContent: 'a' }),
      new Document({ pageContent: 'b' }),
    ];

    const ids = await store.addVectors(vectors, docs);

    expect(ids).toHaveLength(2);
    const storedDocs = db.addMany.mock.calls[0][0];
    expect(storedDocs[0].vector).toBeInstanceOf(Float32Array);
  });

  it('similaritySearchVectorWithScore returns [Document, score][]', async () => {
    const db = createMockVectorDB();
    const store = new LocalModeVectorStore(embeddings, { db: db as any });

    // Add a doc first
    await store.addDocuments([new Document({ pageContent: 'test doc', metadata: { tag: 'x' } })]);

    const results = await store.similaritySearchVectorWithScore([0.1, 0.2, 0.3, 0.4], 1);

    expect(results).toHaveLength(1);
    const [doc, score] = results[0];
    expect(doc).toBeInstanceOf(Document);
    expect(doc.pageContent).toBe('test doc');
    expect(typeof score).toBe('number');
  });

  it('fromDocuments factory creates populated store', async () => {
    const db = createMockVectorDB();
    const store = await LocalModeVectorStore.fromDocuments(
      [new Document({ pageContent: 'from factory' })],
      embeddings,
      { db: db as any }
    );

    expect(store).toBeInstanceOf(LocalModeVectorStore);
    expect(db.addMany).toHaveBeenCalledOnce();
  });

  it('fromExistingIndex factory wraps without adding', async () => {
    const db = createMockVectorDB();
    const store = await LocalModeVectorStore.fromExistingIndex(embeddings, { db: db as any });

    expect(store).toBeInstanceOf(LocalModeVectorStore);
    expect(db.addMany).not.toHaveBeenCalled();
  });
});
