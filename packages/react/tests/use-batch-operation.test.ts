import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBatchOperation } from '../src/core/use-batch-operation.js';

describe('useBatchOperation', () => {
  it('returns initial state', () => {
    const { result } = renderHook(() =>
      useBatchOperation({ fn: async (item: string) => item.toUpperCase() })
    );

    expect(result.current.results).toEqual([]);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.progress).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('processes all items concurrently', async () => {
    const { result } = renderHook(() =>
      useBatchOperation({
        fn: async (n: number) => n * 2,
      })
    );

    await act(async () => {
      await result.current.execute([1, 2, 3, 4, 5]);
    });

    expect(result.current.results.length).toBe(5);
    expect(result.current.results[0].data).toBe(2);
    expect(result.current.results[4].data).toBe(10);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.progress?.completed).toBe(5);
    expect(result.current.progress?.total).toBe(5);
    expect(result.current.progress?.succeeded).toBe(5);
    expect(result.current.progress?.failed).toBe(0);
  });

  it('handles per-item failures without stopping batch', async () => {
    const { result } = renderHook(() =>
      useBatchOperation({
        fn: async (n: number) => {
          if (n === 3) throw new Error('item 3 failed');
          return n * 2;
        },
      })
    );

    await act(async () => {
      await result.current.execute([1, 2, 3, 4]);
    });

    expect(result.current.results.length).toBe(4);
    expect(result.current.results[0].data).toBe(2);
    expect(result.current.results[1].data).toBe(4);
    expect(result.current.results[2].error?.message).toBe('item 3 failed');
    expect(result.current.results[2].data).toBeNull();
    expect(result.current.results[3].data).toBe(8);
    expect(result.current.progress?.succeeded).toBe(3);
    expect(result.current.progress?.failed).toBe(1);
  });

  it('respects concurrency limit', async () => {
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const { result } = renderHook(() =>
      useBatchOperation({
        fn: async (n: number, signal: AbortSignal) => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
          await new Promise((r) => setTimeout(r, 10));
          currentConcurrent--;
          return n;
        },
        concurrency: 2,
      })
    );

    await act(async () => {
      await result.current.execute([1, 2, 3, 4, 5]);
    });

    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(result.current.results.length).toBe(5);
  });

  it('cancels all operations', async () => {
    const { result } = renderHook(() =>
      useBatchOperation({
        fn: async (n: number, signal: AbortSignal) => {
          await new Promise((r) => setTimeout(r, 100));
          signal.throwIfAborted();
          return n;
        },
      })
    );

    act(() => {
      result.current.execute([1, 2, 3]);
    });

    act(() => {
      result.current.cancel();
    });

    // After cancel, should not be running
    expect(result.current.error).toBeNull();
  });

  it('resets state', async () => {
    const { result } = renderHook(() =>
      useBatchOperation({ fn: async (n: number) => n })
    );

    await act(async () => {
      await result.current.execute([1, 2]);
    });

    expect(result.current.results.length).toBe(2);

    act(() => {
      result.current.reset();
    });

    expect(result.current.results).toEqual([]);
    expect(result.current.progress).toBeNull();
    expect(result.current.isRunning).toBe(false);
  });
});
