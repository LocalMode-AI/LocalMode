import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOperation } from '../src/core/use-operation.js';

describe('useOperation', () => {
  it('returns initial state', () => {
    const { result } = renderHook(() =>
      useOperation({ fn: async () => 'hello' })
    );

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('executes successfully and sets data', async () => {
    const { result } = renderHook(() =>
      useOperation({ fn: async () => 42 })
    );

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.data).toBe(42);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets error on failure', async () => {
    const { result } = renderHook(() =>
      useOperation({
        fn: async () => {
          throw new Error('test error');
        },
      })
    );

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error?.message).toBe('test error');
    expect(result.current.isLoading).toBe(false);
  });

  it('silently handles abort errors', async () => {
    const { result } = renderHook(() =>
      useOperation({
        fn: async (_signal: AbortSignal) => {
          const err = new DOMException('aborted', 'AbortError');
          throw err;
        },
      })
    );

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('passes AbortSignal to fn', async () => {
    const fnSpy = vi.fn(async (_signal: AbortSignal) => 'ok');

    const { result } = renderHook(() =>
      useOperation({ fn: fnSpy })
    );

    await act(async () => {
      await result.current.execute();
    });

    expect(fnSpy).toHaveBeenCalledTimes(1);
    const signal = fnSpy.mock.calls[0][0];
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it('cancels via cancel() — aborts signal', async () => {
    let receivedSignal: AbortSignal | null = null;

    const { result } = renderHook(() =>
      useOperation({
        fn: async (signal: AbortSignal) => {
          receivedSignal = signal;
          // Simulate a long operation that checks the signal
          await new Promise((resolve) => setTimeout(resolve, 10));
          signal.throwIfAborted();
          return 'done';
        },
      })
    );

    // Start operation — don't await
    act(() => {
      result.current.execute();
    });

    // Cancel immediately
    act(() => {
      result.current.cancel();
    });

    // The signal should be aborted
    expect(receivedSignal?.aborted).toBe(true);
  });

  it('resets state', async () => {
    const { result } = renderHook(() =>
      useOperation({ fn: async () => 'hello' })
    );

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.data).toBe('hello');

    act(() => {
      result.current.reset();
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});
