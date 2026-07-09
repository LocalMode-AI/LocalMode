import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createMockEmbeddingModel } from '@localmode/core';
import { useSemanticSearch } from '../src/hooks/use-semantic-search.js';

/** Create a mock DB that satisfies SemanticSearchDB */
function createMockSearchDB(results: Array<{ id: string; score: number; text?: string }> = []) {
  return {
    async search() {
      return results.map((r) => ({ id: r.id, score: r.score, metadata: { text: r.text } }));
    },
  };
}

/** A mock DB that records every search call so option forwarding can be asserted */
function createRecordingSearchDB(results: Array<{ id: string; score: number; text?: string }> = []) {
  const calls: Array<{
    vector: Float32Array;
    options?: { k?: number; filter?: Record<string, unknown>; threshold?: number };
  }> = [];
  const db = {
    async search(
      vector: Float32Array,
      options?: { k?: number; filter?: Record<string, unknown>; threshold?: number }
    ) {
      calls.push({ vector, options });
      return results.map((r) => ({ id: r.id, score: r.score, metadata: { text: r.text } }));
    },
  };
  return { db, calls };
}

describe('useSemanticSearch', () => {
  it('returns initial state', () => {
    const model = createMockEmbeddingModel();
    const db = createMockSearchDB();
    const { result } = renderHook(() => useSemanticSearch({ model, db }));

    expect(result.current.results).toEqual([]);
    expect(result.current.isSearching).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('returns empty results for empty query', async () => {
    const model = createMockEmbeddingModel();
    const db = createMockSearchDB([{ id: '1', score: 0.9, text: 'hello' }]);
    const { result } = renderHook(() => useSemanticSearch({ model, db }));

    await act(async () => {
      await result.current.search('');
    });

    expect(result.current.results).toEqual([]);
  });

  it('resets state', async () => {
    const model = createMockEmbeddingModel();
    const db = createMockSearchDB();
    const { result } = renderHook(() => useSemanticSearch({ model, db }));

    act(() => {
      result.current.reset();
    });

    expect(result.current.results).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.isSearching).toBe(false);
  });

  it('forwards hook-level filter, threshold, and topK to db.search', async () => {
    const model = createMockEmbeddingModel();
    const { db, calls } = createRecordingSearchDB([{ id: '1', score: 0.9, text: 'doc' }]);
    const { result } = renderHook(() =>
      useSemanticSearch({ model, db, topK: 5, filter: { category: 'docs' }, threshold: 0.4 })
    );

    await act(async () => {
      await result.current.search('privacy');
    });

    expect(calls.length).toBe(1);
    expect(calls[0].options).toMatchObject({
      k: 5,
      filter: { category: 'docs' },
      threshold: 0.4,
    });
    expect(result.current.results.length).toBe(1);
  });

  it('per-call overrides beat hook-level options', async () => {
    const model = createMockEmbeddingModel();
    const { db, calls } = createRecordingSearchDB([{ id: '1', score: 0.8, text: 'doc' }]);
    const { result } = renderHook(() =>
      useSemanticSearch({ model, db, topK: 5, filter: { category: 'docs' }, threshold: 0.4 })
    );

    await act(async () => {
      await result.current.search('privacy', {
        filter: { category: 'blog' },
        threshold: 0.9,
        topK: 3,
      });
    });

    expect(calls.length).toBe(1);
    expect(calls[0].options).toMatchObject({
      k: 3,
      filter: { category: 'blog' },
      threshold: 0.9,
    });
  });

  it('exposes usage from semanticSearch and clears it on reset', async () => {
    const model = createMockEmbeddingModel();
    const db = createMockSearchDB([{ id: '1', score: 0.9, text: 'doc' }]);
    const { result } = renderHook(() => useSemanticSearch({ model, db }));

    expect(result.current.usage).toBeNull();

    await act(async () => {
      await result.current.search('privacy');
    });

    expect(result.current.usage).not.toBeNull();
    expect(typeof result.current.usage?.embeddingTokens).toBe('number');
    expect(typeof result.current.usage?.embedDurationMs).toBe('number');
    expect(typeof result.current.usage?.searchDurationMs).toBe('number');

    act(() => {
      result.current.reset();
    });
    expect(result.current.usage).toBeNull();
  });
});
