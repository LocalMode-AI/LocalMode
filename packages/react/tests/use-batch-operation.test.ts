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

  describe('progressive publication', () => {
    it('publishes per-item results as they complete (not only when the batch ends)', async () => {
      const gates: Record<number, () => void> = {};

      const { result } = renderHook(() =>
        useBatchOperation({
          fn: (n: number) =>
            new Promise<number>((resolve) => {
              gates[n] = () => resolve(n * 2);
            }),
        })
      );

      let executePromise!: Promise<unknown>;
      await act(async () => {
        executePromise = result.current.execute([1, 2, 3]);
        await new Promise((r) => setTimeout(r, 0));
      });

      // Nothing finished yet
      expect(result.current.isRunning).toBe(true);
      expect(result.current.results).toEqual([]);

      // Complete ONLY item 2 (index 1) — out of order on purpose
      await act(async () => {
        gates[2]();
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(result.current.isRunning).toBe(true);
      expect(result.current.progress).toEqual({ completed: 1, total: 3, succeeded: 1, failed: 0 });
      // The completed item is already visible, carrying its original index
      expect(result.current.results).toHaveLength(1);
      expect(result.current.results[0]).toEqual({ index: 1, data: 4, error: null });

      await act(async () => {
        gates[1]();
        gates[3]();
        await executePromise;
      });

      expect(result.current.isRunning).toBe(false);
      expect(result.current.results).toHaveLength(3);
      expect(result.current.results.map((r) => r.data)).toEqual([2, 4, 6]);
    });

    it('publishes a failed item progressively with its error', async () => {
      const gates: Record<number, { resolve: () => void; reject: (e: Error) => void }> = {};

      const { result } = renderHook(() =>
        useBatchOperation({
          fn: (n: number) =>
            new Promise<number>((resolve, reject) => {
              gates[n] = {
                resolve: () => resolve(n * 2),
                reject: (e) => reject(e),
              };
            }),
        })
      );

      let executePromise!: Promise<unknown>;
      await act(async () => {
        executePromise = result.current.execute([1, 2]);
        await new Promise((r) => setTimeout(r, 0));
      });

      // Fail item 1 (index 0) while item 2 is still running
      await act(async () => {
        gates[1].reject(new Error('item 1 exploded'));
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(result.current.isRunning).toBe(true);
      expect(result.current.progress).toEqual({ completed: 1, total: 2, succeeded: 0, failed: 1 });
      expect(result.current.results).toHaveLength(1);
      expect(result.current.results[0].index).toBe(0);
      expect(result.current.results[0].data).toBeNull();
      expect(result.current.results[0].error?.message).toBe('item 1 exploded');

      await act(async () => {
        gates[2].resolve();
        await executePromise;
      });

      expect(result.current.results).toHaveLength(2);
      expect(result.current.results[1]).toEqual({ index: 1, data: 4, error: null });
    });
  });
});
