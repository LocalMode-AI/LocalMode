import { describe, it, expect, vi } from 'vitest';
import { LocalModeEmbeddingModel } from '../src/embedding-model.js';
import type { EmbeddingModel } from '@localmode/core';

function createMockEmbeddingModel(overrides?: Partial<EmbeddingModel>): EmbeddingModel {
  return {
    modelId: 'test-embedder',
    provider: 'test',
    dimensions: 384,
    maxEmbeddingsPerCall: 100,
    supportsParallelCalls: true,
    doEmbed: vi.fn().mockResolvedValue({
      embeddings: [new Float32Array([0.1, 0.2, 0.3]), new Float32Array([0.4, 0.5, 0.6])],
      usage: { tokens: 10 },
      response: { modelId: 'test-embedder', timestamp: new Date() },
    }),
    ...overrides,
  };
}

describe('LocalModeEmbeddingModel', () => {
  describe('constructor and properties', () => {
    it('has specificationVersion "v3"', () => {
      const model = new LocalModeEmbeddingModel(createMockEmbeddingModel());
      expect(model.specificationVersion).toBe('v3');
    });

    it('has provider "localmode"', () => {
      const model = new LocalModeEmbeddingModel(createMockEmbeddingModel());
      expect(model.provider).toBe('localmode');
    });

    it('takes modelId from the wrapped model', () => {
      const model = new LocalModeEmbeddingModel(createMockEmbeddingModel({ modelId: 'custom-embed' }));
      expect(model.modelId).toBe('custom-embed');
    });

    it('exposes maxEmbeddingsPerCall from wrapped model', () => {
      const model = new LocalModeEmbeddingModel(createMockEmbeddingModel({ maxEmbeddingsPerCall: 50 }));
      expect(model.maxEmbeddingsPerCall).toBe(50);
    });

    it('handles undefined maxEmbeddingsPerCall', () => {
      const model = new LocalModeEmbeddingModel(createMockEmbeddingModel({ maxEmbeddingsPerCall: undefined }));
      expect(model.maxEmbeddingsPerCall).toBeUndefined();
    });

    it('exposes supportsParallelCalls from wrapped model', () => {
      const model = new LocalModeEmbeddingModel(createMockEmbeddingModel({ supportsParallelCalls: false }));
      expect(model.supportsParallelCalls).toBe(false);
    });
  });

  describe('doEmbed', () => {
    it('converts Float32Array[] to number[][]', async () => {
      const model = new LocalModeEmbeddingModel(createMockEmbeddingModel());
      const result = await model.doEmbed({ values: ['hello', 'world'] });

      expect(result.embeddings).toHaveLength(2);
      expect(Array.isArray(result.embeddings[0])).toBe(true);
      expect(result.embeddings[0]).not.toBeInstanceOf(Float32Array);
    });

    it('preserves embedding values during conversion', async () => {
      const model = new LocalModeEmbeddingModel(createMockEmbeddingModel());
      const result = await model.doEmbed({ values: ['hello', 'world'] });

      expect(result.embeddings[0]).toEqual([
        expect.closeTo(0.1, 5),
        expect.closeTo(0.2, 5),
        expect.closeTo(0.3, 5),
      ]);
      expect(result.embeddings[1]).toEqual([
        expect.closeTo(0.4, 5),
        expect.closeTo(0.5, 5),
        expect.closeTo(0.6, 5),
      ]);
    });

    it('forwards token usage', async () => {
      const model = new LocalModeEmbeddingModel(createMockEmbeddingModel());
      const result = await model.doEmbed({ values: ['test'] });
      expect(result.usage).toEqual({ tokens: 10 });
    });

    it('returns empty warnings array', async () => {
      const model = new LocalModeEmbeddingModel(createMockEmbeddingModel());
      const result = await model.doEmbed({ values: ['test'] });
      expect(result.warnings).toEqual([]);
    });

    it('forwards AbortSignal to underlying model', async () => {
      const mockModel = createMockEmbeddingModel();
      const model = new LocalModeEmbeddingModel(mockModel);
      const controller = new AbortController();

      await model.doEmbed({ values: ['test'], abortSignal: controller.signal });

      expect(mockModel.doEmbed).toHaveBeenCalledWith(
        expect.objectContaining({ abortSignal: controller.signal })
      );
    });

    it('forwards values to underlying model', async () => {
      const mockModel = createMockEmbeddingModel();
      const model = new LocalModeEmbeddingModel(mockModel);

      await model.doEmbed({ values: ['a', 'b', 'c'] });

      expect(mockModel.doEmbed).toHaveBeenCalledWith(
        expect.objectContaining({ values: ['a', 'b', 'c'] })
      );
    });

    it('handles single value embedding', async () => {
      const mock = createMockEmbeddingModel({
        doEmbed: vi.fn().mockResolvedValue({
          embeddings: [new Float32Array([1.0, 2.0])],
          usage: { tokens: 3 },
          response: { modelId: 'test-embedder', timestamp: new Date() },
        }),
      });
      const model = new LocalModeEmbeddingModel(mock);
      const result = await model.doEmbed({ values: ['single'] });

      expect(result.embeddings).toHaveLength(1);
      expect(result.embeddings[0]).toEqual([1.0, 2.0]);
    });

    it('handles many values', async () => {
      const embeddings = Array.from({ length: 10 }, () => new Float32Array([0.1]));
      const mock = createMockEmbeddingModel({
        doEmbed: vi.fn().mockResolvedValue({
          embeddings,
          usage: { tokens: 50 },
          response: { modelId: 'test-embedder', timestamp: new Date() },
        }),
      });
      const model = new LocalModeEmbeddingModel(mock);
      const values = Array.from({ length: 10 }, (_, i) => `text-${i}`);
      const result = await model.doEmbed({ values });

      expect(result.embeddings).toHaveLength(10);
      result.embeddings.forEach((emb) => {
        expect(Array.isArray(emb)).toBe(true);
        expect(emb).not.toBeInstanceOf(Float32Array);
      });
    });

    it('propagates errors from underlying model', async () => {
      const mock = createMockEmbeddingModel({
        doEmbed: vi.fn().mockRejectedValue(new Error('Embedding failed')),
      });
      const model = new LocalModeEmbeddingModel(mock);
      await expect(model.doEmbed({ values: ['test'] })).rejects.toThrow('Embedding failed');
    });
  });
});
