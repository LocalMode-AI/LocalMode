/**
 * @file import-export-orchestrator.test.ts
 * @description Integration tests for importFrom() orchestrator
 */

import { describe, it, expect, vi } from 'vitest';
import { importFrom } from '../src/import-export/import-from.js';
import { DimensionMismatchOnImportError } from '../src/errors/index.js';
import { createMockEmbeddingModel } from '../src/testing/index.js';

// ============================================================================
// Mock VectorDB
// ============================================================================

function createTestDB(dimensions = 3) {
  const documents: Array<{ id: string; vector: Float32Array; metadata?: Record<string, unknown> }> = [];

  return {
    dimensions,
    documents,
    async addMany(docs: Array<{ id: string; vector: Float32Array; metadata?: Record<string, unknown> }>) {
      for (const doc of docs) {
        documents.push({ ...doc });
      }
    },
  };
}

// ============================================================================
// importFrom
// ============================================================================

describe('importFrom()', () => {
  it('imports Pinecone data into VectorDB', async () => {
    const db = createTestDB(3);
    const content = JSON.stringify({
      vectors: [
        { id: 'v1', values: [0.1, 0.2, 0.3], metadata: { title: 'A' } },
        { id: 'v2', values: [0.4, 0.5, 0.6], metadata: { title: 'B' } },
      ],
    });

    const stats = await importFrom({ db, content, format: 'pinecone' });

    expect(stats.imported).toBe(2);
    expect(stats.skipped).toBe(0);
    expect(stats.reEmbedded).toBe(0);
    expect(stats.totalParsed).toBe(2);
    expect(stats.format).toBe('pinecone');
    expect(stats.dimensions).toBe(3);
    expect(stats.durationMs).toBeGreaterThanOrEqual(0);
    expect(db.documents).toHaveLength(2);
    expect(db.documents[0].id).toBe('v1');
    expect(db.documents[0].vector).toBeInstanceOf(Float32Array);
  });

  it('auto-detects format when not specified', async () => {
    const db = createTestDB(2);
    const content = JSON.stringify({
      ids: ['d1'],
      embeddings: [[0.1, 0.2]],
      documents: ['hello'],
    });

    const stats = await importFrom({ db, content });
    expect(stats.format).toBe('chroma');
    expect(stats.imported).toBe(1);
  });

  it('throws DimensionMismatchOnImportError', async () => {
    const db = createTestDB(3);
    const content = JSON.stringify({
      vectors: [{ id: 'v1', values: [0.1, 0.2, 0.3, 0.4, 0.5] }],
    });

    await expect(importFrom({ db, content, format: 'pinecone' })).rejects.toThrow(
      DimensionMismatchOnImportError
    );
  });

  it('skips dimension check when skipDimensionCheck is true', async () => {
    const db = createTestDB(3);
    const content = JSON.stringify({
      vectors: [{ id: 'v1', values: [0.1, 0.2, 0.3, 0.4, 0.5] }],
    });

    const stats = await importFrom({ db, content, format: 'pinecone', skipDimensionCheck: true });
    expect(stats.imported).toBe(1);
  });

  it('re-embeds text-only records with model', async () => {
    const db = createTestDB(384);
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const content = JSON.stringify({
      vectors: [
        { id: 'v1', metadata: { text: 'hello world' } },
        { id: 'v2', metadata: { text: 'foo bar' } },
      ],
    });

    const stats = await importFrom({ db, content, format: 'pinecone', model, skipDimensionCheck: true });
    expect(stats.reEmbedded).toBe(2);
    expect(stats.imported).toBe(2);
    expect(stats.skipped).toBe(0);
    expect(db.documents).toHaveLength(2);
    expect(db.documents[0].vector).toBeInstanceOf(Float32Array);
    expect(db.documents[0].vector.length).toBe(384);
  });

  it('skips text-only records when no model provided', async () => {
    const db = createTestDB(3);
    const content = JSON.stringify({
      vectors: [
        { id: 'v1', values: [0.1, 0.2, 0.3] },
        { id: 'v2', metadata: { text: 'text only' } },
      ],
    });

    const stats = await importFrom({ db, content, format: 'pinecone' });
    expect(stats.imported).toBe(1);
    expect(stats.skipped).toBe(1);
    expect(stats.reEmbedded).toBe(0);
  });

  it('respects batchSize', async () => {
    const addManyCalls: number[] = [];
    const db = {
      dimensions: 2,
      async addMany(docs: Array<{ id: string; vector: Float32Array }>) {
        addManyCalls.push(docs.length);
      },
    };

    const vectors = [];
    for (let i = 0; i < 7; i++) {
      vectors.push({ id: `v${i}`, values: [0.1, 0.2] });
    }
    const content = JSON.stringify({ vectors });

    await importFrom({ db, content, format: 'pinecone', batchSize: 3 });

    // 7 records with batchSize 3 -> 3 + 3 + 1
    expect(addManyCalls).toEqual([3, 3, 1]);
  });

  it('supports AbortSignal cancellation', async () => {
    const db = createTestDB(2);
    const controller = new AbortController();
    controller.abort();

    const content = JSON.stringify({ vectors: [{ id: 'v1', values: [0.1, 0.2] }] });

    await expect(
      importFrom({ db, content, format: 'pinecone', abortSignal: controller.signal })
    ).rejects.toThrow();
  });

  it('reports progress through onProgress callback', async () => {
    const db = createTestDB(2);
    const progressUpdates: Array<{ phase: string; completed: number }> = [];

    const content = JSON.stringify({
      vectors: [
        { id: 'v1', values: [0.1, 0.2] },
        { id: 'v2', values: [0.3, 0.4] },
      ],
    });

    await importFrom({
      db,
      content,
      format: 'pinecone',
      onProgress: (p) => progressUpdates.push({ phase: p.phase, completed: p.completed }),
    });

    const phases = progressUpdates.map((p) => p.phase);
    expect(phases).toContain('parsing');
    expect(phases).toContain('validating');
    expect(phases).toContain('importing');
  });

  it('stores text in metadata.text', async () => {
    const db = createTestDB(2);
    const content = JSON.stringify({
      ids: ['d1'],
      embeddings: [[0.1, 0.2]],
      documents: ['hello world'],
    });

    await importFrom({ db, content, format: 'chroma' });
    expect(db.documents[0].metadata?.text).toBe('hello world');
  });
});
