import { describe, it, expect, vi } from 'vitest';
import { LocalModeLanguageModel } from '../src/language-model.js';
import type { LanguageModel, StreamChunk } from '@localmode/core';

function makePrompt(text: string) {
  return [{ role: 'user' as const, content: [{ type: 'text' as const, text }] }];
}

async function collectStreamParts(stream: ReadableStream) {
  const parts: Array<Record<string, unknown>> = [];
  const reader = stream.getReader();
  let done = false;
  while (!done) {
    const result = await reader.read();
    done = result.done;
    if (result.value) {
      parts.push(result.value as Record<string, unknown>);
    }
  }
  return parts;
}

describe('LocalModeLanguageModel doStream', () => {
  describe('with streaming model', () => {
    it('emits stream-start, text-start, text-delta, text-end, and finish parts', async () => {
      const chunks: StreamChunk[] = [
        { text: 'Hello', done: false },
        { text: ' world', done: false },
        { text: '', done: true, finishReason: 'stop', usage: { inputTokens: 3, outputTokens: 5, totalTokens: 8, durationMs: 50 } },
      ];

      const mockModel: LanguageModel = {
        modelId: 'streaming-model',
        provider: 'test',
        contextLength: 4096,
        doGenerate: vi.fn(),
        async *doStream() {
          for (const chunk of chunks) yield chunk;
        },
      };

      const model = new LocalModeLanguageModel(mockModel);
      const { stream } = await model.doStream({ prompt: makePrompt('Hello') });
      const parts = await collectStreamParts(stream);

      const types = parts.map((p) => p.type);
      expect(types[0]).toBe('stream-start');
      expect(types[1]).toBe('text-start');
      expect(types).toContain('text-delta');
      expect(types).toContain('text-end');
      expect(types[types.length - 1]).toBe('finish');
    });

    it('concatenated text-delta values equal full text', async () => {
      const mockModel: LanguageModel = {
        modelId: 'test', provider: 'test', contextLength: 4096,
        doGenerate: vi.fn(),
        async *doStream() {
          yield { text: 'Hello', done: false };
          yield { text: ' ', done: false };
          yield { text: 'world', done: false };
          yield { text: '', done: true, finishReason: 'stop' as const, usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3, durationMs: 10 } };
        },
      };

      const model = new LocalModeLanguageModel(mockModel);
      const { stream } = await model.doStream({ prompt: makePrompt('Hi') });
      const parts = await collectStreamParts(stream);

      const textDeltas = parts.filter((p) => p.type === 'text-delta').map((p) => p.delta as string);
      expect(textDeltas.join('')).toBe('Hello world');
    });

    it('finish part contains usage from last chunk', async () => {
      const mockModel: LanguageModel = {
        modelId: 'test', provider: 'test', contextLength: 4096,
        doGenerate: vi.fn(),
        async *doStream() {
          yield { text: 'Hi', done: false };
          yield { text: '', done: true, finishReason: 'stop' as const, usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, durationMs: 100 } };
        },
      };

      const model = new LocalModeLanguageModel(mockModel);
      const { stream } = await model.doStream({ prompt: makePrompt('Hi') });
      const parts = await collectStreamParts(stream);

      const finish = parts.find((p) => p.type === 'finish') as any;
      expect(finish.usage.inputTokens.total).toBe(10);
      expect(finish.usage.outputTokens.total).toBe(20);
      expect(finish.finishReason).toEqual({ unified: 'stop', raw: 'stop' });
    });

    it('finish part has default usage when no chunk provides it', async () => {
      const mockModel: LanguageModel = {
        modelId: 'test', provider: 'test', contextLength: 4096,
        doGenerate: vi.fn(),
        async *doStream() {
          yield { text: 'Hi', done: false };
          yield { text: '', done: true };
        },
      };

      const model = new LocalModeLanguageModel(mockModel);
      const { stream } = await model.doStream({ prompt: makePrompt('Hi') });
      const parts = await collectStreamParts(stream);

      const finish = parts.find((p) => p.type === 'finish') as any;
      expect(finish.usage.inputTokens.total).toBe(0);
      expect(finish.usage.outputTokens.total).toBe(0);
      expect(finish.finishReason).toEqual({ unified: 'stop', raw: 'stop' });
    });

    it('text-start and text-delta parts have consistent id', async () => {
      const mockModel: LanguageModel = {
        modelId: 'test', provider: 'test', contextLength: 4096,
        doGenerate: vi.fn(),
        async *doStream() {
          yield { text: 'Hi', done: false };
          yield { text: '', done: true, finishReason: 'stop' as const, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, durationMs: 5 } };
        },
      };

      const model = new LocalModeLanguageModel(mockModel);
      const { stream } = await model.doStream({ prompt: makePrompt('Hi') });
      const parts = await collectStreamParts(stream);

      const textStart = parts.find((p) => p.type === 'text-start');
      const textDelta = parts.find((p) => p.type === 'text-delta');
      const textEnd = parts.find((p) => p.type === 'text-end');

      expect(textStart?.id).toBe('text-0');
      expect(textDelta?.id).toBe('text-0');
      expect(textEnd?.id).toBe('text-0');
    });

    it('does not emit text-delta for empty text chunks', async () => {
      const mockModel: LanguageModel = {
        modelId: 'test', provider: 'test', contextLength: 4096,
        doGenerate: vi.fn(),
        async *doStream() {
          yield { text: '', done: false };
          yield { text: 'Hello', done: false };
          yield { text: '', done: true, finishReason: 'stop' as const, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, durationMs: 5 } };
        },
      };

      const model = new LocalModeLanguageModel(mockModel);
      const { stream } = await model.doStream({ prompt: makePrompt('Hi') });
      const parts = await collectStreamParts(stream);

      const textDeltas = parts.filter((p) => p.type === 'text-delta');
      expect(textDeltas).toHaveLength(1);
      expect(textDeltas[0].delta).toBe('Hello');
    });

    it('forwards options to underlying doStream', async () => {
      const doStreamFn = vi.fn(async function* () {
        yield { text: 'hi', done: true, finishReason: 'stop' as const, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, durationMs: 5 } };
      });

      const mockModel: LanguageModel = {
        modelId: 'test', provider: 'test', contextLength: 4096,
        doGenerate: vi.fn(),
        doStream: doStreamFn,
      };

      const model = new LocalModeLanguageModel(mockModel);
      const controller = new AbortController();
      await model.doStream({
        prompt: [
          { role: 'system', content: 'Be brief' },
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
        temperature: 0.5,
        maxOutputTokens: 50,
        topP: 0.8,
        stopSequences: ['END'],
        abortSignal: controller.signal,
      });

      expect(doStreamFn).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: 'Be brief',
          temperature: 0.5,
          maxTokens: 50,
          topP: 0.8,
          stopSequences: ['END'],
          abortSignal: controller.signal,
        })
      );
    });

    it('emits error part when underlying stream throws', async () => {
      const mockModel: LanguageModel = {
        modelId: 'test', provider: 'test', contextLength: 4096,
        doGenerate: vi.fn(),
        async *doStream() {
          yield { text: 'start', done: false };
          throw new Error('Stream broke');
        },
      };

      const model = new LocalModeLanguageModel(mockModel);
      const { stream } = await model.doStream({ prompt: makePrompt('Hi') });
      const parts = await collectStreamParts(stream);

      const errorPart = parts.find((p) => p.type === 'error');
      expect(errorPart).toBeDefined();
      expect((errorPart!.error as Error).message).toBe('Stream broke');
    });
  });

  describe('fallback to doGenerate', () => {
    it('uses doGenerate when doStream is not available', async () => {
      const mockModel: LanguageModel = {
        modelId: 'non-streaming-model',
        provider: 'test',
        contextLength: 4096,
        doGenerate: vi.fn().mockResolvedValue({
          text: 'Complete response',
          finishReason: 'stop',
          usage: { inputTokens: 3, outputTokens: 5, totalTokens: 8, durationMs: 50 },
        }),
      };

      const model = new LocalModeLanguageModel(mockModel);
      const { stream } = await model.doStream({ prompt: makePrompt('Hello') });
      const parts = await collectStreamParts(stream);

      expect(mockModel.doGenerate).toHaveBeenCalled();

      const textDeltas = parts.filter((p) => p.type === 'text-delta');
      expect(textDeltas).toHaveLength(1);
      expect(textDeltas[0].delta).toBe('Complete response');
    });

    it('emits correct part sequence in fallback', async () => {
      const mockModel: LanguageModel = {
        modelId: 'test', provider: 'test', contextLength: 4096,
        doGenerate: vi.fn().mockResolvedValue({
          text: 'Result',
          finishReason: 'length',
          usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3, durationMs: 10 },
        }),
      };

      const model = new LocalModeLanguageModel(mockModel);
      const { stream } = await model.doStream({ prompt: makePrompt('Hi') });
      const parts = await collectStreamParts(stream);

      const types = parts.map((p) => p.type);
      expect(types).toEqual(['stream-start', 'text-start', 'text-delta', 'text-end', 'finish']);
    });

    it('maps finish reason correctly in fallback', async () => {
      const mockModel: LanguageModel = {
        modelId: 'test', provider: 'test', contextLength: 4096,
        doGenerate: vi.fn().mockResolvedValue({
          text: '',
          finishReason: 'content_filter',
          usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1, durationMs: 5 },
        }),
      };

      const model = new LocalModeLanguageModel(mockModel);
      const { stream } = await model.doStream({ prompt: makePrompt('Hi') });
      const parts = await collectStreamParts(stream);

      const finish = parts.find((p) => p.type === 'finish') as any;
      expect(finish.finishReason).toEqual({ unified: 'content-filter', raw: 'content_filter' });
    });
  });

  describe('abort signal', () => {
    it('cuts stream short when aborted', async () => {
      const controller = new AbortController();

      const mockModel: LanguageModel = {
        modelId: 'test', provider: 'test', contextLength: 4096,
        doGenerate: vi.fn(),
        async *doStream() {
          for (let i = 0; i < 100; i++) {
            yield { text: `chunk-${i}`, done: false };
            if (i === 0) controller.abort();
          }
        },
      };

      const model = new LocalModeLanguageModel(mockModel);
      const { stream } = await model.doStream({
        prompt: makePrompt('Hello'),
        abortSignal: controller.signal,
      });
      const parts = await collectStreamParts(stream);

      const textDeltas = parts.filter((p) => p.type === 'text-delta');
      expect(textDeltas.length).toBeLessThan(100);
    });
  });
});
