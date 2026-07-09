/**
 * Tests for the useSemanticCache React hook.
 *
 * Uses the real core createSemanticCache() (in-memory storage) with a
 * deterministic mock embedding model.
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createMockEmbeddingModel } from '@localmode/core';
import { useSemanticCache } from '../src/hooks/use-semantic-cache.js';

describe('useSemanticCache', () => {
  it('initializes the cache and exposes empty stats', async () => {
    const embeddingModel = createMockEmbeddingModel({ dimensions: 384 });
    const { result } = renderHook(() => useSemanticCache({ embeddingModel }));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.cache).toBeNull();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.cache).not.toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.stats.entries).toBe(0);
    expect(result.current.stats.hits).toBe(0);
    expect(result.current.stats.misses).toBe(0);
  });

  it('refreshStats() reflects store/lookup activity on the cache instance', async () => {
    const embeddingModel = createMockEmbeddingModel({ dimensions: 384 });
    const { result } = renderHook(() => useSemanticCache({ embeddingModel }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const cache = result.current.cache!;

    await act(async () => {
      await cache.store({ prompt: 'hello world', response: 'hi', modelId: 'm1' });
      await cache.lookup({ prompt: 'hello world', modelId: 'm1' });
    });

    // Stats are a snapshot — stale until refreshStats() is called
    expect(result.current.stats.entries).toBe(0);

    act(() => {
      result.current.refreshStats();
    });

    expect(result.current.stats.entries).toBe(1);
    expect(result.current.stats.hits).toBe(1);
  });

  it('clear() empties the cache AND auto-refreshes stats', async () => {
    const embeddingModel = createMockEmbeddingModel({ dimensions: 384 });
    const { result } = renderHook(() => useSemanticCache({ embeddingModel }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const cache = result.current.cache!;

    await act(async () => {
      await cache.store({ prompt: 'alpha', response: 'a', modelId: 'm1' });
      await cache.store({ prompt: 'beta', response: 'b', modelId: 'm1' });
    });
    act(() => {
      result.current.refreshStats();
    });
    expect(result.current.stats.entries).toBe(2);

    let cleared: { entriesRemoved: number } | undefined;
    await act(async () => {
      cleared = await result.current.clear();
    });

    // Two witnesses: clear()'s return value AND the auto-refreshed stats
    expect(cleared).toEqual({ entriesRemoved: 2 });
    expect(result.current.stats.entries).toBe(0);

    // ...and the underlying cache instance agrees
    expect(cache.stats().entries).toBe(0);
  });

  it('clear() before initialization resolves to zero entries removed', async () => {
    const embeddingModel = createMockEmbeddingModel({ dimensions: 384 });
    const { result } = renderHook(() => useSemanticCache({ embeddingModel }));

    // Cache not ready yet
    expect(result.current.cache).toBeNull();

    let cleared: { entriesRemoved: number } | undefined;
    await act(async () => {
      cleared = await result.current.clear();
    });
    expect(cleared).toEqual({ entriesRemoved: 0 });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('pins the documented constraint: option changes after mount are ignored', async () => {
    const embeddingModel = createMockEmbeddingModel({ dimensions: 384 });
    const { result, rerender } = renderHook(
      ({ threshold }: { threshold: number }) => useSemanticCache({ embeddingModel, threshold }),
      { initialProps: { threshold: 0.92 } }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const firstInstance = result.current.cache;
    expect(firstInstance).not.toBeNull();

    // Change an option after mount — documented as having NO effect
    rerender({ threshold: 0.5 });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // Same instance, no re-initialization
    expect(result.current.cache).toBe(firstInstance);
    expect(result.current.isLoading).toBe(false);
  });
});
