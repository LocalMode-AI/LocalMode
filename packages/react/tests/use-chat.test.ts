import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChat } from '../src/hooks/use-chat.js';
import { createMockLanguageModel } from '@localmode/core';
import type { ContentPart, LanguageModel, StreamChunk } from '@localmode/core';

/** Flush pending microtasks/macrotasks so async hook work settles */
function flush(ms = 20) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extract plain text from a message content value */
function textOf(content: string | ContentPart[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((part): part is Extract<ContentPart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

/**
 * A LanguageModel whose stream is driven manually from the test.
 * push() emits a non-final chunk; finish() emits the final chunk with usage.
 * The stream respects AbortSignal (aborting unblocks the wait and throws).
 */
function createManualStreamModel() {
  type Item = { text: string; done: boolean };
  const queue: Item[] = [];
  let notify: (() => void) | null = null;

  const model: LanguageModel = {
    modelId: 'mock:manual',
    provider: 'mock',
    contextLength: 4096,
    async doGenerate({ prompt }) {
      return {
        text: 'unused',
        finishReason: 'stop' as const,
        usage: { inputTokens: prompt.length, outputTokens: 1, totalTokens: prompt.length + 1, durationMs: 1 },
      };
    },
    async *doStream({ abortSignal }): AsyncIterable<StreamChunk> {
      while (true) {
        abortSignal?.throwIfAborted?.();
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            notify = resolve;
            abortSignal?.addEventListener?.('abort', () => resolve(), { once: true });
          });
        }
        abortSignal?.throwIfAborted?.();
        const item = queue.shift();
        if (!item) continue;
        yield {
          text: item.text,
          done: item.done,
          finishReason: item.done ? ('stop' as const) : undefined,
          usage: item.done
            ? { inputTokens: 3, outputTokens: 7, totalTokens: 10, durationMs: 5 }
            : undefined,
        };
        if (item.done) return;
      }
    },
  };

  const wake = () => {
    notify?.();
    notify = null;
  };

  return {
    model,
    push(text: string) {
      queue.push({ text, done: false });
      wake();
    },
    finish(text = '') {
      queue.push({ text, done: true });
      wake();
    },
  };
}

/**
 * Minimal in-memory fake of the browser IndexedDB API surface used by
 * chat-persistence.ts (open/upgrade/transaction/get/put/delete). jsdom ships
 * no IndexedDB, so this is the environment boundary fake that lets the REAL
 * persistence adapter run end-to-end. Gap: it is not a real IDB engine —
 * versioning/index semantics are not exercised here.
 */
function installFakeIndexedDB() {
  const databases = new Map<string, Map<string, Map<string, unknown>>>();

  function makeDb(stores: Map<string, Map<string, unknown>>) {
    return {
      objectStoreNames: { contains: (name: string) => stores.has(name) },
      createObjectStore(name: string) {
        stores.set(name, new Map());
      },
      transaction(name: string) {
        const store = stores.get(name);
        if (!store) throw new Error(`No object store: ${name}`);
        const tx: { oncomplete: (() => void) | null; onerror: (() => void) | null; objectStore: () => unknown } = {
          oncomplete: null,
          onerror: null,
          objectStore: () => ({
            get(key: string) {
              const req: { onsuccess: (() => void) | null; onerror: (() => void) | null; result?: unknown } = {
                onsuccess: null,
                onerror: null,
              };
              queueMicrotask(() => {
                req.result = store.get(key);
                req.onsuccess?.();
                queueMicrotask(() => tx.oncomplete?.());
              });
              return req;
            },
            put(value: unknown, key: string) {
              queueMicrotask(() => {
                store.set(key, value);
                tx.oncomplete?.();
              });
            },
            delete(key: string) {
              queueMicrotask(() => {
                store.delete(key);
                tx.oncomplete?.();
              });
            },
          }),
        };
        return tx;
      },
      close() {},
    };
  }

  const fake = {
    open(name: string) {
      const request: {
        onupgradeneeded: (() => void) | null;
        onsuccess: (() => void) | null;
        onerror: (() => void) | null;
        result?: unknown;
      } = { onupgradeneeded: null, onsuccess: null, onerror: null };
      queueMicrotask(() => {
        let stores = databases.get(name);
        const isNew = !stores;
        if (!stores) {
          stores = new Map();
          databases.set(name, stores);
        }
        request.result = makeDb(stores);
        if (isNew) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };

  (globalThis as { indexedDB?: unknown }).indexedDB = fake;
  return () => {
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
  };
}

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

describe('useChat usage', () => {
  it('usage is null initially and populated after a completed turn', async () => {
    const model = createMockLanguageModel();
    const { result } = renderHook(() => useChat({ model, persist: false }));

    expect(result.current.usage).toBeNull();

    await act(async () => {
      await result.current.send('Hello');
    });

    // Mock model: 1 input token ('Hello'), 5 output tokens ('This is a mock response.')
    expect(result.current.usage).not.toBeNull();
    expect(result.current.usage?.inputTokens).toBe(1);
    expect(result.current.usage?.outputTokens).toBe(5);
    expect(result.current.usage?.totalTokens).toBe(6);
    expect(result.current.usage?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('totalUsage starts at zero and accumulates across turns', async () => {
    const model = createMockLanguageModel();
    const { result } = renderHook(() => useChat({ model, persist: false }));

    expect(result.current.totalUsage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      durationMs: 0,
    });

    await act(async () => {
      await result.current.send('Hello');
    });
    await act(async () => {
      await result.current.send('Hi there');
    });

    // Turn 1: 1 in / 5 out. Turn 2: 2 in / 5 out.
    expect(result.current.usage?.inputTokens).toBe(2);
    expect(result.current.totalUsage.inputTokens).toBe(3);
    expect(result.current.totalUsage.outputTokens).toBe(10);
    expect(result.current.totalUsage.totalTokens).toBe(13);
    expect(result.current.totalUsage.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('useChat status & streamingMessageId', () => {
  it('transitions ready → submitted → streaming → ready with streamingMessageId set during the stream', async () => {
    const { model, push, finish } = createManualStreamModel();
    const { result } = renderHook(() => useChat({ model, persist: false }));

    expect(result.current.status).toBe('ready');
    expect(result.current.streamingMessageId).toBeNull();

    let sendPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      sendPromise = result.current.send('hi');
      await flush();
    });

    // No chunk has arrived yet
    expect(result.current.status).toBe('submitted');
    expect(result.current.isStreaming).toBe(true);
    const assistantId = result.current.messages[1]?.id;
    expect(assistantId).toBeTruthy();
    expect(result.current.streamingMessageId).toBe(assistantId);

    await act(async () => {
      push('Hello');
      await flush();
    });

    expect(result.current.status).toBe('streaming');
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.streamingMessageId).toBe(assistantId);
    expect(textOf(result.current.messages[1].content)).toBe('Hello');

    await act(async () => {
      finish(' world');
      await sendPromise;
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.streamingMessageId).toBeNull();
    expect(textOf(result.current.messages[1].content)).toBe('Hello world');
  });

  it('sets status to error when the stream fails', async () => {
    const model: LanguageModel = {
      modelId: 'mock:err',
      provider: 'mock',
      contextLength: 4096,
      async doGenerate() {
        throw new Error('boom');
      },
      // eslint-disable-next-line require-yield
      async *doStream(): AsyncIterable<StreamChunk> {
        throw new Error('boom');
      },
    };
    const { result } = renderHook(() => useChat({ model, persist: false }));

    await act(async () => {
      await result.current.send('hi');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error?.message).toBe('boom');
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.streamingMessageId).toBeNull();
  });
});

describe('useChat setMessages', () => {
  it('replaces the message state', async () => {
    const model = createMockLanguageModel();
    const { result } = renderHook(() => useChat({ model, persist: false }));

    await act(async () => {
      await result.current.send('original');
    });
    expect(result.current.messages.length).toBe(2);

    const replacement = [
      { id: 'a', role: 'user' as const, content: 'Imported question', timestamp: new Date() },
      { id: 'b', role: 'assistant' as const, content: 'Imported answer', timestamp: new Date() },
    ];
    act(() => {
      result.current.setMessages(replacement);
    });

    expect(result.current.messages).toEqual(replacement);
  });

  it('persists replaced messages through the real persistence adapter', async () => {
    const restore = installFakeIndexedDB();
    try {
      const model = createMockLanguageModel();
      const key = `test-set-messages-${Date.now()}`;
      const first = renderHook(() => useChat({ model, persist: true, persistKey: key }));

      // Let the load-on-mount settle before replacing
      await act(async () => {
        await flush();
      });

      const replacement = [
        { id: 'p1', role: 'user' as const, content: 'Persisted question', timestamp: new Date() },
        { id: 'p2', role: 'assistant' as const, content: 'Persisted answer', timestamp: new Date() },
      ];
      await act(async () => {
        first.result.current.setMessages(replacement);
        await flush();
      });
      first.unmount();

      // A fresh hook instance with the same key must load the replaced messages
      const second = renderHook(() => useChat({ model, persist: true, persistKey: key }));
      await act(async () => {
        await flush();
      });

      expect(second.result.current.messages.length).toBe(2);
      expect(second.result.current.messages[0].content).toBe('Persisted question');
      expect(second.result.current.messages[1].content).toBe('Persisted answer');
      second.unmount();
    } finally {
      restore();
    }
  });
});

describe('useChat regenerate & variants', () => {
  it('regenerate produces a second variant without appending messages; setVariantIndex switches the active reply; send resets variants', async () => {
    const model = createMockLanguageModel({
      responses: ['first reply', 'second reply', 'third answer'],
    });
    const streamSpy = vi.spyOn(model, 'doStream');
    const { result } = renderHook(() => useChat({ model, persist: false }));

    await act(async () => {
      await result.current.send('Question one');
    });
    expect(textOf(result.current.messages[1].content)).toBe('first reply');
    expect(result.current.variants).toEqual(['first reply']);
    expect(result.current.variantIndex).toBe(0);

    await act(async () => {
      await result.current.regenerate();
    });

    // No new messages appended — same turn, new variant
    expect(result.current.messages.length).toBe(2);
    expect(result.current.variants).toEqual(['first reply', 'second reply']);
    expect(result.current.variantIndex).toBe(1);
    expect(textOf(result.current.messages[1].content)).toBe('second reply');

    // The regeneration re-ran the LAST user turn with the same prior context
    const lastStreamOptions = streamSpy.mock.calls.at(-1)![0];
    expect(lastStreamOptions.prompt).toBe('Question one');
    expect(lastStreamOptions.messages).toEqual([{ role: 'user', content: 'Question one' }]);

    // Switching variants updates the last assistant message in place
    act(() => {
      result.current.setVariantIndex(0);
    });
    expect(textOf(result.current.messages[1].content)).toBe('first reply');
    expect(result.current.variantIndex).toBe(0);
    expect(result.current.variants).toEqual(['first reply', 'second reply']);

    // Out-of-range indices are clamped
    act(() => {
      result.current.setVariantIndex(99);
    });
    expect(result.current.variantIndex).toBe(1);
    expect(textOf(result.current.messages[1].content)).toBe('second reply');

    // A new send resets variants to the fresh turn
    await act(async () => {
      await result.current.send('Another question');
    });
    expect(result.current.messages.length).toBe(4);
    expect(textOf(result.current.messages[3].content)).toBe('third answer');
    expect(result.current.variants).toEqual(['third answer']);
    expect(result.current.variantIndex).toBe(0);
  });

  it('regenerate updates usage and totalUsage for the completed regeneration', async () => {
    const model = createMockLanguageModel({ responses: ['one two', 'three four five'] });
    const { result } = renderHook(() => useChat({ model, persist: false }));

    await act(async () => {
      await result.current.send('Hello');
    });
    // 'one two' = 2 output tokens
    expect(result.current.totalUsage.outputTokens).toBe(2);

    await act(async () => {
      await result.current.regenerate();
    });
    // 'three four five' = 3 output tokens
    expect(result.current.usage?.outputTokens).toBe(3);
    expect(result.current.totalUsage.outputTokens).toBe(5);
  });

  it('regenerate is a no-op when there is no assistant turn', async () => {
    const model = createMockLanguageModel();
    const { result } = renderHook(() => useChat({ model, persist: false }));

    await act(async () => {
      await result.current.regenerate();
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.status).toBe('ready');
    expect(result.current.variants).toEqual([]);
  });

  it('cancel during regenerate restores the previously active variant', async () => {
    const { model, push, finish } = createManualStreamModel();
    const { result } = renderHook(() => useChat({ model, persist: false }));

    // Complete a real first turn
    await act(async () => {
      const p = result.current.send('hello world');
      await flush();
      push('original');
      finish(' reply');
      await p;
    });
    expect(textOf(result.current.messages[1].content)).toBe('original reply');
    expect(result.current.status).toBe('ready');

    // Start a regeneration and let a partial chunk stream into the message
    let regenPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      regenPromise = result.current.regenerate();
      await flush();
      push('partial regen');
      await flush();
    });
    expect(result.current.status).toBe('streaming');
    expect(result.current.streamingMessageId).toBe(result.current.messages[1].id);
    expect(textOf(result.current.messages[1].content)).toBe('partial regen');

    // Cancel mid-stream
    await act(async () => {
      result.current.cancel();
      await regenPromise;
      await flush();
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.streamingMessageId).toBeNull();
    expect(result.current.messages.length).toBe(2);
    expect(textOf(result.current.messages[1].content)).toBe('original reply');
    expect(result.current.variants).toEqual(['original reply']);
    expect(result.current.variantIndex).toBe(0);
    expect(result.current.error).toBeNull();
  });
});
