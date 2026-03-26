import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOperationList } from '../src/core/use-operation-list';

describe('useOperationList', () => {
  it('starts with empty items', () => {
    const { result } = renderHook(() =>
      useOperationList({
        fn: async (x: string) => x.toUpperCase(),
        transform: (r) => r,
      })
    );
    expect(result.current.items).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('accumulates items on successful execute', async () => {
    const { result } = renderHook(() =>
      useOperationList({
        fn: async (x: string, _signal: AbortSignal) => ({ text: x.toUpperCase() }),
        transform: (r) => r.text,
      })
    );

    await act(async () => { await result.current.execute('hello'); });
    expect(result.current.items).toEqual(['HELLO']);

    await act(async () => { await result.current.execute('world'); });
    expect(result.current.items).toEqual(['WORLD', 'HELLO']);
  });

  it('appends when prepend=false', async () => {
    const { result } = renderHook(() =>
      useOperationList({
        fn: async (x: string, _signal: AbortSignal) => x,
        transform: (r) => r,
        prepend: false,
      })
    );

    await act(async () => { await result.current.execute('a'); });
    await act(async () => { await result.current.execute('b'); });
    expect(result.current.items).toEqual(['a', 'b']);
  });

  it('does not add items on error', async () => {
    const { result } = renderHook(() =>
      useOperationList({
        fn: async (_x: string, _signal: AbortSignal) => { throw new Error('fail'); },
        transform: (r) => r,
      })
    );

    await act(async () => { await result.current.execute('x'); });
    expect(result.current.items).toEqual([]);
    expect(result.current.error?.message).toBe('fail');
  });

  it('clearItems empties the list', async () => {
    const { result } = renderHook(() =>
      useOperationList({
        fn: async (x: string, _signal: AbortSignal) => x,
        transform: (r) => r,
      })
    );

    await act(async () => { await result.current.execute('a'); });
    expect(result.current.items).toEqual(['a']);

    act(() => { result.current.clearItems(); });
    expect(result.current.items).toEqual([]);
  });

  it('reset clears error but keeps items', async () => {
    const { result } = renderHook(() =>
      useOperationList({
        fn: async (x: string, _signal: AbortSignal) => {
          if (x === 'fail') throw new Error('fail');
          return x;
        },
        transform: (r) => r,
      })
    );

    await act(async () => { await result.current.execute('a'); });
    await act(async () => { await result.current.execute('fail'); });
    expect(result.current.error?.message).toBe('fail');
    expect(result.current.items).toEqual(['a']);

    act(() => { result.current.reset(); });
    expect(result.current.error).toBeNull();
    expect(result.current.items).toEqual(['a']);
  });

  it('passes input args to transform', async () => {
    interface Input { question: string; doc: string }

    const { result } = renderHook(() =>
      useOperationList<[Input], { answer: string }, { question: string; answer: string }>({
        fn: async (input: Input, _signal: AbortSignal) => ({ answer: `A for ${input.question}` }),
        transform: (r, input) => ({
          question: input.question,
          answer: r.answer,
        }),
      })
    );

    await act(async () => {
      await result.current.execute({ question: 'What?', doc: 'doc.png' });
    });

    expect(result.current.items[0]).toEqual({
      question: 'What?',
      answer: 'A for What?',
    });
  });

  it('existing single-arg transforms still work', async () => {
    const { result } = renderHook(() =>
      useOperationList({
        fn: async (x: string, _signal: AbortSignal) => ({ label: x }),
        transform: (r) => r.label, // single arg — ignores extra input args
      })
    );

    await act(async () => { await result.current.execute('test'); });
    expect(result.current.items).toEqual(['test']);
  });

  it('removeItem removes matching items', async () => {
    const { result } = renderHook(() =>
      useOperationList({
        fn: async (id: string, _signal: AbortSignal) => ({ id }),
        transform: (r) => r,
        prepend: false,
      })
    );

    await act(async () => { await result.current.execute('a'); });
    await act(async () => { await result.current.execute('b'); });
    await act(async () => { await result.current.execute('c'); });

    act(() => { result.current.removeItem((item) => item.id === 'b'); });
    expect(result.current.items).toEqual([{ id: 'a' }, { id: 'c' }]);
  });

  it('removeItem no-ops when no match', async () => {
    const { result } = renderHook(() =>
      useOperationList({
        fn: async (id: string, _signal: AbortSignal) => ({ id }),
        transform: (r) => r,
      })
    );

    await act(async () => { await result.current.execute('a'); });
    act(() => { result.current.removeItem((item) => item.id === 'nonexistent'); });
    expect(result.current.items).toEqual([{ id: 'a' }]);
  });

  it('setItems replaces items array', async () => {
    const { result } = renderHook(() =>
      useOperationList({
        fn: async (x: string, _signal: AbortSignal) => x,
        transform: (r) => r,
      })
    );

    await act(async () => { await result.current.execute('hello'); });
    act(() => { result.current.setItems(['replaced', 'items']); });
    expect(result.current.items).toEqual(['replaced', 'items']);
  });
});
