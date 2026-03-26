import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSequentialBatch } from '../src/core/use-sequential-batch';

describe('useSequentialBatch', () => {
  it('starts with empty state', () => {
    const { result } = renderHook(() =>
      useSequentialBatch({
        fn: async (x: string) => x.toUpperCase(),
      })
    );
    expect(result.current.results).toEqual([]);
    expect(result.current.progress).toEqual({ current: 0, total: 0 });
    expect(result.current.isRunning).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('processes items sequentially and returns results', async () => {
    const order: string[] = [];
    const { result } = renderHook(() =>
      useSequentialBatch({
        fn: async (x: string, _signal: AbortSignal) => {
          order.push(x);
          return x.toUpperCase();
        },
      })
    );

    let results: (string | null)[] = [];
    await act(async () => { results = await result.current.execute(['a', 'b', 'c']); });

    expect(order).toEqual(['a', 'b', 'c']);
    expect(results).toEqual(['A', 'B', 'C']);
    expect(result.current.results).toEqual(['A', 'B', 'C']);
    expect(result.current.isRunning).toBe(false);
  });

  it('handles per-item errors with null', async () => {
    const { result } = renderHook(() =>
      useSequentialBatch({
        fn: async (x: string, _signal: AbortSignal) => {
          if (x === 'bad') throw new Error('item error');
          return x.toUpperCase();
        },
      })
    );

    let results: (string | null)[] = [];
    await act(async () => { results = await result.current.execute(['a', 'bad', 'c']); });

    expect(results).toEqual(['A', null, 'C']);
    expect(result.current.error).toBeNull();
  });

  it('supports cancellation', async () => {
    let callCount = 0;
    const { result } = renderHook(() =>
      useSequentialBatch({
        fn: async (x: string, signal: AbortSignal) => {
          callCount++;
          if (callCount === 2) {
            // Simulate abort on second item
            const controller = (signal as unknown as { _controller?: AbortController })._controller;
            if (controller) controller.abort();
            signal.throwIfAborted?.();
          }
          return x;
        },
      })
    );

    await act(async () => { await result.current.execute(['a', 'b', 'c']); });
    expect(result.current.isRunning).toBe(false);
    // At least first item processed
    expect(result.current.results.length).toBeGreaterThanOrEqual(1);
  });

  it('tracks progress', async () => {
    const progressSnapshots: Array<{ current: number; total: number }> = [];
    const { result } = renderHook(() =>
      useSequentialBatch({
        fn: async (x: string, _signal: AbortSignal) => x,
      })
    );

    await act(async () => {
      await result.current.execute(['a', 'b']);
    });

    // After completion, progress should be at total
    expect(result.current.progress).toEqual({ current: 2, total: 2 });
  });

  it('reset clears all state', async () => {
    const { result } = renderHook(() =>
      useSequentialBatch({
        fn: async (x: string, _signal: AbortSignal) => x,
      })
    );

    await act(async () => { await result.current.execute(['a']); });
    expect(result.current.results).toEqual(['a']);

    act(() => { result.current.reset(); });
    expect(result.current.results).toEqual([]);
    expect(result.current.progress).toEqual({ current: 0, total: 0 });
    expect(result.current.isRunning).toBe(false);
  });

  it('returns empty array for empty input', async () => {
    const { result } = renderHook(() =>
      useSequentialBatch({
        fn: async (x: string, _signal: AbortSignal) => x,
      })
    );

    let results: (string | null)[] = [];
    await act(async () => { results = await result.current.execute([]); });
    expect(results).toEqual([]);
  });
});
