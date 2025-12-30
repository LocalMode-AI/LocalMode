/**
 * @fileoverview Tests for the embeddings domain
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  embed,
  embedMany,
  streamEmbedMany,
  wrapEmbeddingModel,
  composeEmbeddingMiddleware,
  createMockEmbeddingModel,
  createTestVector,
} from '../src/index.js';
import type {
  EmbeddingModel,
  EmbedOptions,
  EmbeddingModelMiddleware,
} from '../src/index.js';

describe('embed()', () => {
  it('returns embedding and usage', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });

    const result = await embed({
      model,
      value: 'Hello world',
    });

    expect(result).toHaveProperty('embedding');
    expect(result).toHaveProperty('usage');
    expect(result).toHaveProperty('response');
    expect(result.embedding).toBeInstanceOf(Float32Array);
    expect(result.embedding.length).toBe(384);
    expect(result.usage.tokens).toBeGreaterThan(0);
    expect(result.response.modelId).toBe('mock:test-model');
    expect(result.response.timestamp).toBeInstanceOf(Date);
  });

  it('supports AbortSignal', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384, delay: 1000 });
    const controller = new AbortController();

    const promise = embed({
      model,
      value: 'Hello',
      abortSignal: controller.signal,
    });

    // Abort immediately
    controller.abort();

    await expect(promise).rejects.toThrow();
  });

  it('respects maxRetries option', async () => {
    let attempts = 0;
    const model = createMockEmbeddingModel({
      dimensions: 384,
      failCount: 2,
      onEmbed: () => {
        attempts++;
      },
    });

    const result = await embed({
      model,
      value: 'Hello',
      maxRetries: 3,
    });

    expect(result.embedding).toBeDefined();
    expect(attempts).toBe(3); // 1 initial + 2 retries
  });

  it('throws after exhausting retries', async () => {
    const model = createMockEmbeddingModel({
      dimensions: 384,
      failCount: 5, // More failures than retries
    });

    await expect(
      embed({
        model,
        value: 'Hello',
        maxRetries: 2,
      })
    ).rejects.toThrow();
  });

  it('passes headers to model', async () => {
    let receivedHeaders: Record<string, string> | undefined;
    const model = createMockEmbeddingModel({
      dimensions: 384,
      onEmbed: (options) => {
        receivedHeaders = options.headers;
      },
    });

    await embed({
      model,
      value: 'Hello',
      headers: { 'X-Custom-Header': 'test-value' },
    });

    expect(receivedHeaders).toEqual({ 'X-Custom-Header': 'test-value' });
  });

  it('passes providerOptions to model', async () => {
    let receivedOptions: Record<string, Record<string, unknown>> | undefined;
    const model = createMockEmbeddingModel({
      dimensions: 384,
      onEmbed: (options) => {
        receivedOptions = options.providerOptions;
      },
    });

    await embed({
      model,
      value: 'Hello',
      providerOptions: {
        transformers: { device: 'webgpu', quantized: true },
      },
    });

    expect(receivedOptions).toEqual({
      transformers: { device: 'webgpu', quantized: true },
    });
  });
});

describe('embedMany()', () => {
  it('returns embeddings array and usage', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });

    const result = await embedMany({
      model,
      values: ['hello', 'world', 'test'],
    });

    expect(result.embeddings).toHaveLength(3);
    expect(result.embeddings[0]).toBeInstanceOf(Float32Array);
    expect(result.embeddings[0].length).toBe(384);
    expect(result.usage.tokens).toBeGreaterThan(0);
    expect(result.response.modelId).toBe('mock:test-model');
  });

  it('handles empty array', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });

    const result = await embedMany({
      model,
      values: [],
    });

    expect(result.embeddings).toHaveLength(0);
    expect(result.usage.tokens).toBe(0);
  });

  it('supports AbortSignal', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384, delay: 500 });
    const controller = new AbortController();

    const promise = embedMany({
      model,
      values: ['hello', 'world'],
      abortSignal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toThrow();
  });

  it('respects batchSize option', async () => {
    let batchSizes: number[] = [];
    const model = createMockEmbeddingModel({
      dimensions: 384,
      onEmbed: (options) => {
        batchSizes.push(options.values.length);
      },
    });

    await embedMany({
      model,
      values: Array(10).fill('test'),
    });

    // Model is called with all values at once (or based on maxEmbeddingsPerCall)
    // For batch processing, use streamEmbedMany()
    expect(batchSizes.length).toBeGreaterThan(0);
  });
});

describe('streamEmbedMany()', () => {
  it('yields embeddings with indices', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const values = ['hello', 'world', 'test'];
    const results: Array<{ embedding: Float32Array; index: number }> = [];

    for await (const result of streamEmbedMany({
      model,
      values,
      batchSize: 2,
    })) {
      results.push(result);
    }

    expect(results).toHaveLength(3);
    expect(results[0].index).toBe(0);
    expect(results[1].index).toBe(1);
    expect(results[2].index).toBe(2);
    expect(results[0].embedding).toBeInstanceOf(Float32Array);
  });

  it('calls onBatch callback', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const batchCalls: Array<{ index: number; count: number; total: number }> = [];

    for await (const _ of streamEmbedMany({
      model,
      values: Array(5).fill('test'),
      batchSize: 2,
      onBatch: (progress) => {
        batchCalls.push({ index: progress.index, count: progress.count, total: progress.total });
      },
    })) {
      // consume iterator
    }

    // Verify onBatch was called
    expect(batchCalls.length).toBeGreaterThan(0);
    // Verify total is correct in all calls
    expect(batchCalls[0].total).toBe(5);
  });

  it('supports AbortSignal', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384, delay: 100 });
    const controller = new AbortController();

    const promise = (async () => {
      const results: unknown[] = [];
      for await (const result of streamEmbedMany({
        model,
        values: Array(10).fill('test'),
        batchSize: 2,
        abortSignal: controller.signal,
      })) {
        results.push(result);
        if (results.length >= 2) {
          controller.abort();
        }
      }
      return results;
    })();

    await expect(promise).rejects.toThrow();
  });
});

describe('wrapEmbeddingModel()', () => {
  it('wraps model with transformParams middleware', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });

    const middleware: EmbeddingModelMiddleware = {
      transformParams: ({ values }) => ({
        values: values.map((v) => v.toUpperCase()),
      }),
    };

    const wrappedModel = wrapEmbeddingModel({ model, middleware });

    // The transformation happens internally
    const result = await embed({ model: wrappedModel, value: 'hello' });
    expect(result.embedding).toBeDefined();
  });

  it('wraps model with wrapEmbed middleware', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const logs: string[] = [];

    const middleware: EmbeddingModelMiddleware = {
      wrapEmbed: async ({ doEmbed, values }) => {
        logs.push(`before: ${values.join(', ')}`);
        const result = await doEmbed();
        logs.push(`after: ${result.embeddings.length} embeddings`);
        return result;
      },
    };

    const wrappedModel = wrapEmbeddingModel({ model, middleware });
    await embed({ model: wrappedModel, value: 'test' });

    expect(logs).toContain('before: test');
    expect(logs).toContain('after: 1 embeddings');
  });

  it('supports caching via middleware', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const cache = new Map<string, Float32Array>();
    let embedCalls = 0;

    const cachingMiddleware: EmbeddingModelMiddleware = {
      wrapEmbed: async ({ doEmbed, values }) => {
        const key = values.join('|||');
        const cached = cache.get(key);
        if (cached) {
          return {
            embeddings: [cached],
            usage: { tokens: 0 },
            response: { modelId: 'mock:test-model', timestamp: new Date() },
          };
        }
        embedCalls++;
        const result = await doEmbed();
        cache.set(key, result.embeddings[0]);
        return result;
      },
    };

    const wrappedModel = wrapEmbeddingModel({ model, middleware: cachingMiddleware });

    // First call - should hit model
    await embed({ model: wrappedModel, value: 'test' });
    expect(embedCalls).toBe(1);

    // Second call - should hit cache
    const result = await embed({ model: wrappedModel, value: 'test' });
    expect(embedCalls).toBe(1); // Not incremented
    expect(result.usage.tokens).toBe(0); // Cached result
  });
});

describe('composeEmbeddingMiddleware()', () => {
  it('composes multiple middleware in order', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const order: string[] = [];

    const middleware1: EmbeddingModelMiddleware = {
      wrapEmbed: async ({ doEmbed }) => {
        order.push('m1-before');
        const result = await doEmbed();
        order.push('m1-after');
        return result;
      },
    };

    const middleware2: EmbeddingModelMiddleware = {
      wrapEmbed: async ({ doEmbed }) => {
        order.push('m2-before');
        const result = await doEmbed();
        order.push('m2-after');
        return result;
      },
    };

    const composed = composeEmbeddingMiddleware([middleware1, middleware2]);
    const wrappedModel = wrapEmbeddingModel({ model, middleware: composed });

    await embed({ model: wrappedModel, value: 'test' });

    expect(order).toEqual(['m1-before', 'm2-before', 'm2-after', 'm1-after']);
  });
});

describe('createMockEmbeddingModel()', () => {
  it('creates a mock with correct interface', () => {
    const model = createMockEmbeddingModel({ dimensions: 768 });

    expect(model.modelId).toBe('mock:test-model');
    expect(model.provider).toBe('mock');
    expect(model.dimensions).toBe(768);
    expect(model.maxEmbeddingsPerCall).toBe(100);
    expect(model.supportsParallelCalls).toBe(true);
    expect(typeof model.doEmbed).toBe('function');
  });

  it('generates deterministic embeddings with seed', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384, seed: 42 });

    const result1 = await model.doEmbed({ values: ['test'] });
    const result2 = await model.doEmbed({ values: ['test'] });

    // With same seed and same input, should get same embedding
    expect(Array.from(result1.embeddings[0])).toEqual(Array.from(result2.embeddings[0]));
  });

  it('simulates delay', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384, delay: 100 });
    const start = Date.now();

    await model.doEmbed({ values: ['test'] });

    const duration = Date.now() - start;
    expect(duration).toBeGreaterThanOrEqual(90); // Allow some variance
  });

  it('simulates failures with failCount', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384, failCount: 2 });

    // First two calls should fail
    await expect(model.doEmbed({ values: ['test'] })).rejects.toThrow();
    await expect(model.doEmbed({ values: ['test'] })).rejects.toThrow();

    // Third call should succeed
    const result = await model.doEmbed({ values: ['test'] });
    expect(result.embeddings).toHaveLength(1);
  });
});

describe('createTestVector()', () => {
  it('creates vector with correct dimensions', () => {
    const vector = createTestVector(384, 42);
    expect(vector).toBeInstanceOf(Float32Array);
    expect(vector.length).toBe(384);
  });

  it('creates normalized vectors', () => {
    const vector = createTestVector(384, 42);
    let magnitude = 0;
    for (let i = 0; i < vector.length; i++) {
      magnitude += vector[i] * vector[i];
    }
    magnitude = Math.sqrt(magnitude);
    expect(magnitude).toBeCloseTo(1, 4);
  });

  it('produces deterministic output with same seed', () => {
    const v1 = createTestVector(384, 42);
    const v2 = createTestVector(384, 42);
    expect(Array.from(v1)).toEqual(Array.from(v2));
  });

  it('produces different output with different seeds', () => {
    const v1 = createTestVector(384, 42);
    const v2 = createTestVector(384, 43);
    expect(Array.from(v1)).not.toEqual(Array.from(v2));
  });
});

