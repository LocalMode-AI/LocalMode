import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePipeline } from '../src/hooks/use-pipeline.js';

describe('usePipeline', () => {
  it('returns initial state', () => {
    const { result } = renderHook(() => usePipeline([]));

    expect(result.current.result).toBeNull();
    expect(result.current.isRunning).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.currentStep).toBeNull();
    expect(result.current.progress).toBeNull();
  });

  it('executes steps sequentially', async () => {
    const steps = [
      { name: 'double', execute: async (n: unknown) => (n as number) * 2 },
      { name: 'add-ten', execute: async (n: unknown) => (n as number) + 10 },
    ];

    const { result } = renderHook(() => usePipeline(steps));

    await act(async () => {
      await result.current.execute(5);
    });

    expect(result.current.result).toBe(20); // (5 * 2) + 10
    expect(result.current.isRunning).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('tracks progress', async () => {
    const progressLog: Array<{ completed: number; total: number }> = [];

    const steps = [
      { name: 'step-1', execute: async (v: unknown) => v },
      { name: 'step-2', execute: async (v: unknown) => v },
      { name: 'step-3', execute: async (v: unknown) => v },
    ];

    const { result } = renderHook(() => usePipeline(steps));

    await act(async () => {
      await result.current.execute('input');
    });

    expect(result.current.progress?.completed).toBe(3);
    expect(result.current.progress?.total).toBe(3);
  });

  it('handles step failure', async () => {
    const steps = [
      { name: 'ok', execute: async (v: unknown) => v },
      {
        name: 'fail',
        execute: async () => {
          throw new Error('step failed');
        },
      },
      { name: 'never-reached', execute: async (v: unknown) => v },
    ];

    const { result } = renderHook(() => usePipeline(steps));

    await act(async () => {
      await result.current.execute('input');
    });

    expect(result.current.error?.message).toBe('step failed');
    expect(result.current.result).toBeNull();
    expect(result.current.isRunning).toBe(false);
  });

  it('resets state', async () => {
    const steps = [
      { name: 'echo', execute: async (v: unknown) => v },
    ];

    const { result } = renderHook(() => usePipeline(steps));

    await act(async () => {
      await result.current.execute('hello');
    });

    expect(result.current.result).toBe('hello');

    act(() => {
      result.current.reset();
    });

    expect(result.current.result).toBeNull();
    expect(result.current.progress).toBeNull();
    expect(result.current.currentStep).toBeNull();
  });
});
