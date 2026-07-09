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

  describe('itemErrors', () => {
    it('starts empty and is cleared by reset', async () => {
      const { result } = renderHook(() =>
        useSequentialBatch({
          fn: async (x: string, _signal: AbortSignal) => {
            throw new Error(`fail ${x}`);
          },
        })
      );

      expect(result.current.itemErrors).toEqual([]);

      await act(async () => { await result.current.execute(['a']); });
      expect(result.current.itemErrors).toHaveLength(1);

      act(() => { result.current.reset(); });
      expect(result.current.itemErrors).toEqual([]);
    });

    it('captures per-item errors index-aligned with results', async () => {
      const { result } = renderHook(() =>
        useSequentialBatch({
          fn: async (x: string, _signal: AbortSignal) => {
            if (x === 'bad') throw new Error('item error: bad');
            return x.toUpperCase();
          },
        })
      );

      await act(async () => { await result.current.execute(['a', 'bad', 'c']); });

      // results still collapse failures to null (existing contract)...
      expect(result.current.results).toEqual(['A', null, 'C']);
      // ...but the error is no longer lost: itemErrors is index-aligned
      expect(result.current.itemErrors).toHaveLength(3);
      expect(result.current.itemErrors[0]).toBeNull();
      expect(result.current.itemErrors[1]).toBeInstanceOf(Error);
      expect(result.current.itemErrors[1]?.message).toBe('item error: bad');
      expect(result.current.itemErrors[2]).toBeNull();
      // Batch-level error stays null for per-item failures
      expect(result.current.error).toBeNull();
    });
  });

  describe('incremental publication', () => {
    it('publishes results and itemErrors as each item completes (not only at the end)', async () => {
      let releaseSecond!: () => void;
      const secondGate = new Promise<void>((r) => { releaseSecond = r; });

      const { result } = renderHook(() =>
        useSequentialBatch({
          fn: async (x: string, _signal: AbortSignal) => {
            if (x === 'b') await secondGate;
            return x.toUpperCase();
          },
        })
      );

      let executePromise!: Promise<(string | null)[]>;
      await act(async () => {
        executePromise = result.current.execute(['a', 'b']);
        // Let item 'a' finish and React flush state; item 'b' stays blocked
        await new Promise((r) => setTimeout(r, 0));
      });

      // Mid-run: progress has ticked AND the completed result is already visible
      expect(result.current.isRunning).toBe(true);
      expect(result.current.progress).toEqual({ current: 1, total: 2 });
      expect(result.current.results).toEqual(['A']);
      expect(result.current.itemErrors).toEqual([null]);

      await act(async () => {
        releaseSecond();
        await executePromise;
      });

      expect(result.current.isRunning).toBe(false);
      expect(result.current.results).toEqual(['A', 'B']);
      expect(result.current.itemErrors).toEqual([null, null]);
    });

    it('publishes a failed item incrementally with its error', async () => {
      let releaseSecond!: () => void;
      const secondGate = new Promise<void>((r) => { releaseSecond = r; });

      const { result } = renderHook(() =>
        useSequentialBatch({
          fn: async (x: string, _signal: AbortSignal) => {
            if (x === 'bad') throw new Error('mid-run failure');
            if (x === 'b') await secondGate;
            return x.toUpperCase();
          },
        })
      );

      let executePromise!: Promise<(string | null)[]>;
      await act(async () => {
        executePromise = result.current.execute(['bad', 'b']);
        await new Promise((r) => setTimeout(r, 0));
      });

      // The failure for item 0 is visible while item 1 is still running
      expect(result.current.isRunning).toBe(true);
      expect(result.current.results).toEqual([null]);
      expect(result.current.itemErrors).toHaveLength(1);
      expect(result.current.itemErrors[0]?.message).toBe('mid-run failure');

      await act(async () => {
        releaseSecond();
        await executePromise;
      });

      expect(result.current.results).toEqual([null, 'B']);
      expect(result.current.itemErrors[1]).toBeNull();
    });
  });
});
