/**
 * Tests for the useReindex React hook.
 *
 * Uses a real in-memory VectorDB and the real core reindexCollection()
 * call path — only the embedding model is a deterministic mock.
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createVectorDB, createMockEmbeddingModel } from '@localmode/core';
import type { EmbeddingModel, ReindexResult, VectorDB } from '@localmode/core';
import { useReindex } from '../src/hooks/use-reindex.js';

async function makeSeededDb(name: string, model: EmbeddingModel): Promise<VectorDB> {
  const db = await createVectorDB({
    name: `${name}-${Date.now()}`,
    dimensions: 384,
    storage: 'memory',
    model,
  });

  await db.add({
    id: 'doc-1',
    vector: new Float32Array(384).fill(0.1),
    metadata: { _text: 'Hello world', category: 'test' },
  });
  await db.add({
    id: 'doc-2',
    vector: new Float32Array(384).fill(0.2),
    metadata: { _text: 'Goodbye world', category: 'test' },
  });

  return db;
}

describe('useReindex', () => {
  it('returns initial state with null result', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const db = await makeSeededDb('reindex-initial', model);

    const { result } = renderHook(() => useReindex({ db, model }));

    expect(result.current.isReindexing).toBe(false);
    expect(result.current.progress).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.result).toBeNull();

    await db.close();
  });

  it('exposes the ReindexResult as state after a successful run', async () => {
    const oldModel = createMockEmbeddingModel({ dimensions: 384 });
    const db = await makeSeededDb('reindex-success', oldModel);
    const newModel = createMockEmbeddingModel({
      dimensions: 384,
      modelId: 'mock:new-model',
    });

    const { result } = renderHook(() => useReindex({ db, model: newModel }));

    let returned: ReindexResult | null = null;
    await act(async () => {
      returned = await result.current.reindex();
    });

    // Two witnesses: the promise resolution AND the retained state agree
    expect(returned).not.toBeNull();
    expect(result.current.result).toEqual(returned);
    expect(result.current.result!.reindexed).toBe(2);
    expect(result.current.result!.skipped).toBe(0);
    expect(result.current.result!.durationMs).toBeGreaterThanOrEqual(0);

    expect(result.current.isReindexing).toBe(false);
    expect(result.current.error).toBeNull();

    await db.close();
  });

  it('reports progress while reindexing', async () => {
    const oldModel = createMockEmbeddingModel({ dimensions: 384 });
    const db = await makeSeededDb('reindex-progress', oldModel);
    const newModel = createMockEmbeddingModel({ dimensions: 384 });

    const { result } = renderHook(() => useReindex({ db, model: newModel, batchSize: 1 }));

    await act(async () => {
      await result.current.reindex();
    });

    // Final progress snapshot covers the whole collection
    expect(result.current.progress).not.toBeNull();
    expect(result.current.progress!.total).toBe(2);
    expect(result.current.progress!.completed).toBe(2);

    await db.close();
  });

  it('sets error and keeps result null when reindex fails', async () => {
    const oldModel = createMockEmbeddingModel({ dimensions: 384 });
    const db = await makeSeededDb('reindex-failure', oldModel);

    // A model whose embedding always fails — real failure surface, not a
    // pre-resolved error.
    const failingModel: EmbeddingModel = {
      modelId: 'mock:failing',
      provider: 'mock',
      dimensions: 384,
      maxEmbeddingsPerCall: 100,
      supportsParallelCalls: true,
      async doEmbed() {
        throw new Error('embedding backend unavailable');
      },
    };

    const { result } = renderHook(() => useReindex({ db, model: failingModel }));

    let returned: ReindexResult | null = null;
    await act(async () => {
      returned = await result.current.reindex();
    });

    expect(returned).toBeNull();
    expect(result.current.result).toBeNull();
    // The hook exposes a real Error (not a { message } shape).
    expect(result.current.error).toBeInstanceOf(Error);
    // Core's embed retry path (default maxRetries: 2 → 3 attempts) wraps the
    // model failure; the hook surfaces that wrapper's message.
    expect(result.current.error!.message).toBe('Embedding failed after 3 attempts');
    expect(result.current.isReindexing).toBe(false);

    // clearError() clears only the error
    act(() => {
      result.current.clearError();
    });
    expect(result.current.error).toBeNull();

    await db.close();
  });

  it('clears the previous result at the start of a new run', async () => {
    const oldModel = createMockEmbeddingModel({ dimensions: 384 });
    const db = await makeSeededDb('reindex-clear-on-rerun', oldModel);
    const goodModel = createMockEmbeddingModel({ dimensions: 384 });

    let shouldFail = false;
    const flakyModel: EmbeddingModel = {
      modelId: 'mock:flaky',
      provider: 'mock',
      dimensions: 384,
      maxEmbeddingsPerCall: 100,
      supportsParallelCalls: true,
      async doEmbed(options) {
        if (shouldFail) throw new Error('flaky failure');
        return goodModel.doEmbed(options);
      },
    };

    const { result } = renderHook(() => useReindex({ db, model: flakyModel }));

    await act(async () => {
      await result.current.reindex();
    });
    expect(result.current.result).not.toBeNull();

    // Second run fails — the stale success result must not survive
    shouldFail = true;
    await act(async () => {
      await result.current.reindex();
    });
    expect(result.current.result).toBeNull();
    expect(result.current.error).not.toBeNull();

    await db.close();
  });
});
