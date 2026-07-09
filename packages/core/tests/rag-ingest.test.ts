/**
 * @fileoverview Tests for ingest() call forms, model-driven embedding,
 * and abort behavior.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createVectorDB,
  ingest,
  TEXT_METADATA_FIELD,
  createMockEmbeddingModel,
} from '../src/index.js';
import type { VectorDB } from '../src/index.js';

const DIM = 384;

const DOCS = [
  { text: 'First document about reactors and codenames.', metadata: { source: 'a.txt' } },
  { text: 'Second document about tropical fruit.', metadata: { source: 'b.txt' } },
];

let dbCounter = 0;

async function createDb(): Promise<VectorDB> {
  return createVectorDB({
    name: `rag-ingest-test-${dbCounter++}`,
    dimensions: DIM,
    storage: 'memory',
  });
}

describe('ingest() positional form', () => {
  it('behaves as before with generateEmbeddings + embedder', async () => {
    const db = await createDb();
    const embedder = vi.fn(async (texts: string[]) =>
      texts.map(() => new Float32Array(DIM).fill(0.5))
    );

    const result = await ingest(db, DOCS, { generateEmbeddings: true, embedder });

    expect(result.chunksCreated).toBe(2);
    expect(result.chunkIds).toHaveLength(2);
    expect(embedder).toHaveBeenCalled();
    expect((await db.stats()).count).toBe(2);

    const stored = await db.get(result.chunkIds[0]);
    expect(stored?.metadata?.[TEXT_METADATA_FIELD]).toBe(DOCS[0].text);
  });

  it('tracks chunk IDs without adding vectors when embeddings are off', async () => {
    const db = await createDb();
    const result = await ingest(db, DOCS);

    expect(result.chunksCreated).toBe(2);
    expect((await db.stats()).count).toBe(0);
  });
});

describe('ingest() object form', () => {
  it('accepts the docs-verbatim shape: ingest({ db, model, documents })', async () => {
    const db = await createDb();
    const model = createMockEmbeddingModel({ dimensions: DIM });

    const result = await ingest({ db, model, documents: DOCS });

    expect(result.chunksCreated).toBe(2);
    expect((await db.stats()).count).toBe(2);
    const stored = await db.get(result.chunkIds[0]);
    expect(stored?.vector).toBeInstanceOf(Float32Array);
    expect(stored?.metadata?.[TEXT_METADATA_FIELD]).toBe(DOCS[0].text);
  });

  it('behaves like the positional form with an embedder', async () => {
    const db = await createDb();
    const embedder = vi.fn(async (texts: string[]) =>
      texts.map(() => new Float32Array(DIM).fill(0.25))
    );

    const result = await ingest({ db, documents: DOCS, generateEmbeddings: true, embedder });

    expect(result.chunksCreated).toBe(2);
    expect(embedder).toHaveBeenCalled();
    expect((await db.stats()).count).toBe(2);
  });

  it('respects an explicit generateEmbeddings: false with a model', async () => {
    const db = await createDb();
    const model = createMockEmbeddingModel({ dimensions: DIM });

    const result = await ingest({ db, model, documents: DOCS, generateEmbeddings: false });

    expect(result.chunksCreated).toBe(2);
    expect((await db.stats()).count).toBe(0);
  });

  it('rejects when both model and embedder are provided', async () => {
    const db = await createDb();
    const model = createMockEmbeddingModel({ dimensions: DIM });
    const embedder = async (texts: string[]) =>
      texts.map(() => new Float32Array(DIM));

    await expect(
      ingest({ db, model, documents: DOCS, embedder })
    ).rejects.toThrow(/model.*embedder|embedder.*model/i);
    expect((await db.stats()).count).toBe(0);
  });

  it('honors per-option overrides (chunking, idPrefix)', async () => {
    const db = await createDb();
    const model = createMockEmbeddingModel({ dimensions: DIM });

    const result = await ingest({
      db,
      model,
      documents: [{ id: 'doc-a', text: 'alpha beta gamma' }],
      idPrefix: 'custom',
    });

    expect(result.chunkIds[0]).toMatch(/^custom_doc-a_/);
  });
});

describe('ingest() argument validation', () => {
  // JavaScript callers get no overload checking, so a missing db/documents
  // must fail loudly rather than silently ingesting nothing.
  it('throws an actionable error when documents are omitted (positional)', async () => {
    const db = await createDb();

    await expect(
      (ingest as unknown as (db: VectorDB) => Promise<unknown>)(db)
    ).rejects.toThrow(/requires a `documents` array/);
    expect((await db.stats()).count).toBe(0);
  });

  it('throws an actionable error when documents are omitted (object form)', async () => {
    const db = await createDb();
    const model = createMockEmbeddingModel({ dimensions: DIM });

    await expect(
      (ingest as unknown as (o: object) => Promise<unknown>)({ db, model })
    ).rejects.toThrow(/requires a `documents` array/);
    expect((await db.stats()).count).toBe(0);
  });

  it('throws an actionable error when db is missing or is not a VectorDB', async () => {
    await expect(
      (ingest as unknown as (o: object) => Promise<unknown>)({ documents: DOCS })
    ).rejects.toThrow(/requires a VectorDB/);

    // A storage adapter is a common mistake — it has no addMany()
    await expect(
      (ingest as unknown as (o: object) => Promise<unknown>)({
        db: { get: async () => null },
        documents: DOCS,
      })
    ).rejects.toThrow(/requires a VectorDB/);
  });
});

describe('ingest() abort behavior', () => {
  it('rejects before starting when the signal is already aborted', async () => {
    const db = await createDb();
    const controller = new AbortController();
    controller.abort();

    await expect(
      ingest(db, DOCS, {
        generateEmbeddings: true,
        embedder: async (texts) => texts.map(() => new Float32Array(DIM)),
        abortSignal: controller.signal,
      })
    ).rejects.toThrow();
    expect((await db.stats()).count).toBe(0);
  });

  it('stops embedding when aborted between batches', async () => {
    const db = await createDb();
    const controller = new AbortController();
    let calls = 0;

    const manyDocs = Array.from({ length: 4 }, (_, i) => ({
      id: `d${i}`,
      text: `document number ${i}`,
    }));

    const embedder = vi.fn(async (texts: string[]) => {
      calls++;
      // Abort during the first batch; the check before batch 2 must fire.
      controller.abort();
      return texts.map(() => new Float32Array(DIM));
    });

    await expect(
      ingest({
        db,
        documents: manyDocs,
        generateEmbeddings: true,
        embedder,
        batchSize: 1,
        abortSignal: controller.signal,
      })
    ).rejects.toThrow();

    expect(calls).toBe(1);
    expect((await db.stats()).count).toBe(0);
  });
});
