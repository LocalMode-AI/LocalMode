import { describe, it, expect, vi } from 'vitest';
import { createLocalMode } from '../src/provider.js';
import { LocalModeLanguageModel } from '../src/language-model.js';
import { LocalModeEmbeddingModel } from '../src/embedding-model.js';
import { LocalModeError } from '@localmode/core';
import type { LanguageModel, EmbeddingModel } from '@localmode/core';

function createMockLLM(overrides?: Partial<LanguageModel>): LanguageModel {
  return {
    modelId: 'mock-llm',
    provider: 'test',
    contextLength: 4096,
    doGenerate: vi.fn().mockResolvedValue({
      text: 'hello',
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, durationMs: 10 },
    }),
    ...overrides,
  };
}

function createMockEmbedder(overrides?: Partial<EmbeddingModel>): EmbeddingModel {
  return {
    modelId: 'mock-embedder',
    provider: 'test',
    dimensions: 384,
    maxEmbeddingsPerCall: 100,
    supportsParallelCalls: true,
    doEmbed: vi.fn().mockResolvedValue({
      embeddings: [new Float32Array([0.1, 0.2])],
      usage: { tokens: 5 },
      response: { modelId: 'mock-embedder', timestamp: new Date() },
    }),
    ...overrides,
  };
}

describe('createLocalMode', () => {
  describe('provider properties', () => {
    it('has specificationVersion "v3"', () => {
      const provider = createLocalMode({ models: { llm: createMockLLM() } });
      expect(provider.specificationVersion).toBe('v3');
    });

    it('specificationVersion is not writable', () => {
      const provider = createLocalMode({ models: { llm: createMockLLM() } });
      expect(() => {
        (provider as any).specificationVersion = 'v2';
      }).toThrow();
    });
  });

  describe('callable provider', () => {
    it('returns LanguageModelV3 when called as function', () => {
      const provider = createLocalMode({ models: { llm: createMockLLM() } });
      const model = provider('llm');
      expect(model).toBeInstanceOf(LocalModeLanguageModel);
      expect(model.specificationVersion).toBe('v3');
    });

    it('returns same type as .languageModel()', () => {
      const llm = createMockLLM();
      const provider = createLocalMode({ models: { llm } });
      const fromCall = provider('llm');
      const fromMethod = provider.languageModel('llm');
      expect(fromCall.modelId).toBe(fromMethod.modelId);
      expect(fromCall.specificationVersion).toBe(fromMethod.specificationVersion);
      expect(fromCall.provider).toBe(fromMethod.provider);
    });

    it('throws for unknown model ID when called as function', () => {
      const provider = createLocalMode({ models: { llm: createMockLLM() } });
      expect(() => provider('nonexistent')).toThrow(/not found/);
    });
  });

  describe('languageModel()', () => {
    it('returns LocalModeLanguageModel instance', () => {
      const provider = createLocalMode({ models: { llm: createMockLLM() } });
      const model = provider.languageModel('llm');
      expect(model).toBeInstanceOf(LocalModeLanguageModel);
    });

    it('preserves the wrapped model modelId', () => {
      const provider = createLocalMode({ models: { llm: createMockLLM({ modelId: 'my-llama' }) } });
      const model = provider.languageModel('llm');
      expect(model.modelId).toBe('my-llama');
    });

    it('throws LocalModeError for unknown model ID', () => {
      const provider = createLocalMode({ models: { llm: createMockLLM() } });
      try {
        provider.languageModel('nonexistent');
        expect.unreachable('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(LocalModeError);
        expect((e as LocalModeError).code).toBe('MODEL_NOT_FOUND');
        expect((e as LocalModeError).message).toContain('nonexistent');
        expect((e as LocalModeError).message).toContain('Available models: llm');
        expect((e as LocalModeError).hint).toContain('createLocalMode');
      }
    });

    it('throws LocalModeError when model is an embedding model', () => {
      const provider = createLocalMode({ models: { emb: createMockEmbedder() } });
      try {
        provider.languageModel('emb');
        expect.unreachable('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(LocalModeError);
        expect((e as LocalModeError).code).toBe('MODEL_TYPE_MISMATCH');
        expect((e as LocalModeError).message).toContain('not a language model');
        expect((e as LocalModeError).hint).toContain('embeddingModel');
      }
    });
  });

  describe('embeddingModel()', () => {
    it('returns LocalModeEmbeddingModel instance', () => {
      const provider = createLocalMode({ models: { emb: createMockEmbedder() } });
      const model = provider.embeddingModel('emb');
      expect(model).toBeInstanceOf(LocalModeEmbeddingModel);
    });

    it('preserves the wrapped model modelId', () => {
      const provider = createLocalMode({ models: { emb: createMockEmbedder({ modelId: 'my-embed' }) } });
      const model = provider.embeddingModel('emb');
      expect(model.modelId).toBe('my-embed');
    });

    it('throws LocalModeError for unknown model ID', () => {
      const provider = createLocalMode({ models: { emb: createMockEmbedder() } });
      try {
        provider.embeddingModel('nonexistent');
        expect.unreachable('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(LocalModeError);
        expect((e as LocalModeError).code).toBe('MODEL_NOT_FOUND');
        expect((e as LocalModeError).message).toContain('nonexistent');
        expect((e as LocalModeError).message).toContain('Available models: emb');
      }
    });

    it('throws LocalModeError when model is a language model', () => {
      const provider = createLocalMode({ models: { llm: createMockLLM() } });
      try {
        provider.embeddingModel('llm');
        expect.unreachable('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(LocalModeError);
        expect((e as LocalModeError).code).toBe('MODEL_TYPE_MISMATCH');
        expect((e as LocalModeError).message).toContain('not an embedding model');
        expect((e as LocalModeError).hint).toContain('languageModel');
      }
    });
  });

  describe('multiple models', () => {
    it('supports both language and embedding models', () => {
      const provider = createLocalMode({
        models: {
          llm: createMockLLM(),
          emb: createMockEmbedder(),
        },
      });

      expect(provider.languageModel('llm')).toBeInstanceOf(LocalModeLanguageModel);
      expect(provider.embeddingModel('emb')).toBeInstanceOf(LocalModeEmbeddingModel);
    });

    it('lists all available models in error message', () => {
      const provider = createLocalMode({
        models: {
          llm1: createMockLLM(),
          llm2: createMockLLM(),
          emb: createMockEmbedder(),
        },
      });

      try {
        provider.languageModel('missing');
        expect.unreachable('Should have thrown');
      } catch (e) {
        expect((e as LocalModeError).message).toContain('llm1');
        expect((e as LocalModeError).message).toContain('llm2');
        expect((e as LocalModeError).message).toContain('emb');
      }
    });

    it('creates new adapter instances on each call', () => {
      const provider = createLocalMode({ models: { llm: createMockLLM() } });
      const a = provider.languageModel('llm');
      const b = provider.languageModel('llm');
      expect(a).not.toBe(b);
      expect(a.modelId).toBe(b.modelId);
    });
  });
});
