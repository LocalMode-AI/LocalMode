import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChat } from '../src/hooks/use-chat.js';
import { createMockLanguageModel } from '@localmode/core';

describe('useChat', () => {
  it('returns initial state', () => {
    const model = createMockLanguageModel();
    const { result } = renderHook(() => useChat({ model, persist: false }));

    expect(result.current.messages).toEqual([]);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('adds user message on send (assistant may error without streaming support)', async () => {
    const model = createMockLanguageModel();
    const { result } = renderHook(() => useChat({ model, persist: false }));

    await act(async () => {
      await result.current.send('Hello');
    });

    // User message is always added
    expect(result.current.messages.length).toBeGreaterThanOrEqual(1);
    expect(result.current.messages[0].role).toBe('user');
    expect(result.current.messages[0].content).toBe('Hello');
  });

  it('generates unique message IDs', async () => {
    const model = createMockLanguageModel();
    const { result } = renderHook(() => useChat({ model, persist: false }));

    await act(async () => {
      await result.current.send('test');
    });

    const ids = result.current.messages.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBeTruthy();
  });

  it('clears messages', async () => {
    const model = createMockLanguageModel();
    const { result } = renderHook(() => useChat({ model, persist: false }));

    await act(async () => {
      await result.current.send('test');
    });
    expect(result.current.messages.length).toBeGreaterThanOrEqual(1);

    act(() => {
      result.current.clearMessages();
    });
    expect(result.current.messages).toEqual([]);
  });

  it('uses initialMessages when no persisted data', () => {
    const model = createMockLanguageModel();
    const initial = [
      { id: '1', role: 'user' as const, content: 'Hello', timestamp: new Date() },
      { id: '2', role: 'assistant' as const, content: 'Hi!', timestamp: new Date() },
    ];
    const { result } = renderHook(() =>
      useChat({ model, persist: false, initialMessages: initial })
    );

    expect(result.current.messages.length).toBe(2);
    expect(result.current.messages[0].content).toBe('Hello');
    expect(result.current.messages[1].content).toBe('Hi!');
  });

  it('sets streaming to false after send completes', async () => {
    const model = createMockLanguageModel();
    const { result } = renderHook(() => useChat({ model, persist: false }));

    await act(async () => {
      await result.current.send('go');
    });

    expect(result.current.isStreaming).toBe(false);
  });

  it('accepts system prompt option', () => {
    const model = createMockLanguageModel();
    const { result } = renderHook(() =>
      useChat({ model, systemPrompt: 'You are helpful', persist: false })
    );

    expect(result.current.messages).toEqual([]);
  });

  it('updates system prompt via setSystemPrompt', () => {
    const model = createMockLanguageModel();
    const { result } = renderHook(() => useChat({ model, persist: false }));

    act(() => {
      result.current.setSystemPrompt('Be concise');
    });

    expect(result.current.error).toBeNull();
  });

  it('persist defaults to true', () => {
    const model = createMockLanguageModel();
    // Just verify the hook works with default persist (true)
    const { result } = renderHook(() => useChat({ model }));

    expect(result.current.messages).toEqual([]);
    expect(result.current.isStreaming).toBe(false);
  });
});
