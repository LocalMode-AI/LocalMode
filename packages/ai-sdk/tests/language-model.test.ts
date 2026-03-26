import { describe, it, expect, vi } from 'vitest';
import { LocalModeLanguageModel } from '../src/language-model.js';
import type { LanguageModel } from '@localmode/core';

function createMockLanguageModel(overrides?: Partial<LanguageModel>): LanguageModel {
  return {
    modelId: 'test-model',
    provider: 'test',
    contextLength: 4096,
    doGenerate: vi.fn().mockResolvedValue({
      text: 'Hello from local model',
      finishReason: 'stop' as const,
      usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15, durationMs: 100 },
    }),
    ...overrides,
  };
}

function makePrompt(text: string) {
  return [{ role: 'user' as const, content: [{ type: 'text' as const, text }] }];
}

describe('LocalModeLanguageModel', () => {
  describe('constructor and properties', () => {
    it('has specificationVersion "v3"', () => {
      const model = new LocalModeLanguageModel(createMockLanguageModel());
      expect(model.specificationVersion).toBe('v3');
    });

    it('has provider "localmode"', () => {
      const model = new LocalModeLanguageModel(createMockLanguageModel());
      expect(model.provider).toBe('localmode');
    });

    it('takes modelId from the wrapped model', () => {
      const model = new LocalModeLanguageModel(createMockLanguageModel({ modelId: 'custom-id' }));
      expect(model.modelId).toBe('custom-id');
    });

    it('supportedUrls returns empty record', () => {
      const model = new LocalModeLanguageModel(createMockLanguageModel());
      expect(model.supportedUrls).toEqual({});
    });
  });

  describe('doGenerate', () => {
    it('returns content array with text part', async () => {
      const model = new LocalModeLanguageModel(createMockLanguageModel());
      const result = await model.doGenerate({ prompt: makePrompt('Hello') });

      expect(result.content).toEqual([{ type: 'text', text: 'Hello from local model' }]);
    });

    it('returns finishReason as { unified, raw } object', async () => {
      const model = new LocalModeLanguageModel(createMockLanguageModel());
      const result = await model.doGenerate({ prompt: makePrompt('Hello') });

      expect(result.finishReason).toEqual({ unified: 'stop', raw: 'stop' });
    });

    it('returns usage with nested inputTokens and outputTokens', async () => {
      const model = new LocalModeLanguageModel(createMockLanguageModel());
      const result = await model.doGenerate({ prompt: makePrompt('Hello') });

      expect(result.usage.inputTokens).toEqual({
        total: 5,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      });
      expect(result.usage.outputTokens).toEqual({
        total: 10,
        text: 10,
        reasoning: undefined,
      });
    });

    it('returns empty warnings array', async () => {
      const model = new LocalModeLanguageModel(createMockLanguageModel());
      const result = await model.doGenerate({ prompt: makePrompt('Hello') });
      expect(result.warnings).toEqual([]);
    });

    it('forwards AbortSignal to underlying model', async () => {
      const mockModel = createMockLanguageModel();
      const model = new LocalModeLanguageModel(mockModel);
      const controller = new AbortController();

      await model.doGenerate({ prompt: makePrompt('Hello'), abortSignal: controller.signal });

      expect(mockModel.doGenerate).toHaveBeenCalledWith(
        expect.objectContaining({ abortSignal: controller.signal })
      );
    });

    it('forwards temperature', async () => {
      const mockModel = createMockLanguageModel();
      const model = new LocalModeLanguageModel(mockModel);

      await model.doGenerate({ prompt: makePrompt('Hi'), temperature: 0.3 });

      expect(mockModel.doGenerate).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0.3 })
      );
    });

    it('maps maxOutputTokens to maxTokens', async () => {
      const mockModel = createMockLanguageModel();
      const model = new LocalModeLanguageModel(mockModel);

      await model.doGenerate({ prompt: makePrompt('Hi'), maxOutputTokens: 200 });

      expect(mockModel.doGenerate).toHaveBeenCalledWith(
        expect.objectContaining({ maxTokens: 200 })
      );
    });

    it('forwards topP', async () => {
      const mockModel = createMockLanguageModel();
      const model = new LocalModeLanguageModel(mockModel);

      await model.doGenerate({ prompt: makePrompt('Hi'), topP: 0.9 });

      expect(mockModel.doGenerate).toHaveBeenCalledWith(
        expect.objectContaining({ topP: 0.9 })
      );
    });

    it('forwards stopSequences', async () => {
      const mockModel = createMockLanguageModel();
      const model = new LocalModeLanguageModel(mockModel);

      await model.doGenerate({ prompt: makePrompt('Hi'), stopSequences: ['END', 'STOP'] });

      expect(mockModel.doGenerate).toHaveBeenCalledWith(
        expect.objectContaining({ stopSequences: ['END', 'STOP'] })
      );
    });

    it('extracts system message from prompt', async () => {
      const mockModel = createMockLanguageModel();
      const model = new LocalModeLanguageModel(mockModel);

      await model.doGenerate({
        prompt: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
      });

      expect(mockModel.doGenerate).toHaveBeenCalledWith(
        expect.objectContaining({ systemPrompt: 'You are helpful' })
      );
    });

    it('passes messages for multi-turn conversations', async () => {
      const mockModel = createMockLanguageModel();
      const model = new LocalModeLanguageModel(mockModel);

      await model.doGenerate({
        prompt: [
          { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
          { role: 'assistant', content: [{ type: 'text', text: 'Hello!' }] },
          { role: 'user', content: [{ type: 'text', text: 'How are you?' }] },
        ],
      });

      const callArgs = (mockModel.doGenerate as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.messages).toHaveLength(3);
      expect(callArgs.messages[0]).toEqual({ role: 'user', content: 'Hi' });
      expect(callArgs.messages[1]).toEqual({ role: 'assistant', content: 'Hello!' });
      expect(callArgs.messages[2]).toEqual({ role: 'user', content: 'How are you?' });
    });

    it('does not pass messages when only user prompt exists', async () => {
      const mockModel = createMockLanguageModel();
      const model = new LocalModeLanguageModel(mockModel);

      await model.doGenerate({ prompt: makePrompt('Hello') });

      const callArgs = (mockModel.doGenerate as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.messages).toHaveLength(1);
    });

    it('maps finish reason "length"', async () => {
      const mock = createMockLanguageModel({
        doGenerate: vi.fn().mockResolvedValue({
          text: 'cut off',
          finishReason: 'length',
          usage: { inputTokens: 5, outputTokens: 256, totalTokens: 261, durationMs: 50 },
        }),
      });
      const result = await new LocalModeLanguageModel(mock).doGenerate({ prompt: makePrompt('Hi') });
      expect(result.finishReason).toEqual({ unified: 'length', raw: 'length' });
    });

    it('maps finish reason "content_filter" to "content-filter"', async () => {
      const mock = createMockLanguageModel({
        doGenerate: vi.fn().mockResolvedValue({
          text: '',
          finishReason: 'content_filter',
          usage: { inputTokens: 5, outputTokens: 0, totalTokens: 5, durationMs: 10 },
        }),
      });
      const result = await new LocalModeLanguageModel(mock).doGenerate({ prompt: makePrompt('Hi') });
      expect(result.finishReason).toEqual({ unified: 'content-filter', raw: 'content_filter' });
    });

    it('maps finish reason "error"', async () => {
      const mock = createMockLanguageModel({
        doGenerate: vi.fn().mockResolvedValue({
          text: '',
          finishReason: 'error',
          usage: { inputTokens: 5, outputTokens: 0, totalTokens: 5, durationMs: 10 },
        }),
      });
      const result = await new LocalModeLanguageModel(mock).doGenerate({ prompt: makePrompt('Hi') });
      expect(result.finishReason).toEqual({ unified: 'error', raw: 'error' });
    });

    it('maps unknown finish reason to "other"', async () => {
      const mock = createMockLanguageModel({
        doGenerate: vi.fn().mockResolvedValue({
          text: '',
          finishReason: 'something_new' as any,
          usage: { inputTokens: 5, outputTokens: 0, totalTokens: 5, durationMs: 10 },
        }),
      });
      const result = await new LocalModeLanguageModel(mock).doGenerate({ prompt: makePrompt('Hi') });
      expect(result.finishReason).toEqual({ unified: 'other', raw: 'something_new' });
    });

    it('propagates errors from underlying model', async () => {
      const mock = createMockLanguageModel({
        doGenerate: vi.fn().mockRejectedValue(new Error('Model crashed')),
      });
      const model = new LocalModeLanguageModel(mock);
      await expect(model.doGenerate({ prompt: makePrompt('Hi') })).rejects.toThrow('Model crashed');
    });
  });
});
