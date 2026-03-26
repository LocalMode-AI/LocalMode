import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStreaming } from '../src/core/use-streaming.js';

async function* mockGenerator(chunks: string[]): AsyncGenerator<string, void, unknown> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

describe('useStreaming', () => {
  it('returns initial state', () => {
    const { result } = renderHook(() =>
      useStreaming({ fn: () => mockGenerator([]) })
    );

    expect(result.current.content).toBe('');
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('accumulates streamed chunks', async () => {
    const { result } = renderHook(() =>
      useStreaming({
        fn: () => mockGenerator(['Hello', ' ', 'World']),
      })
    );

    await act(async () => {
      await result.current.send('test');
    });

    expect(result.current.content).toBe('Hello World');
    expect(result.current.isStreaming).toBe(false);
  });

  it('handles stream errors', async () => {
    const { result } = renderHook(() =>
      useStreaming({
        fn: async function* () {
          yield 'partial';
          throw new Error('stream error');
        },
      })
    );

    await act(async () => {
      await result.current.send('test');
    });

    expect(result.current.content).toBe('partial');
    expect(result.current.error?.message).toBe('stream error');
    expect(result.current.isStreaming).toBe(false);
  });

  it('resets state', async () => {
    const { result } = renderHook(() =>
      useStreaming({
        fn: () => mockGenerator(['Hello']),
      })
    );

    await act(async () => {
      await result.current.send('test');
    });

    expect(result.current.content).toBe('Hello');

    act(() => {
      result.current.reset();
    });

    expect(result.current.content).toBe('');
    expect(result.current.error).toBeNull();
    expect(result.current.isStreaming).toBe(false);
  });
});
