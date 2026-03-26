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
});
