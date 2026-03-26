/**
 * @fileoverview Tests for the multimodal embeddings domain
 */

import { describe, it, expect } from 'vitest';
import {
  embedImage,
  embedManyImages,
  createMockMultimodalEmbeddingModel,
  createTestVector,
  cosineSimilarity,
} from '../src/index.js';

describe('embedImage()', () => {
  it('returns embedding and usage', async () => {
    const model = createMockMultimodalEmbeddingModel({ dimensions: 512 });

    const result = await embedImage({
      model,
      image: 'https://example.com/cat.jpg',
    });

    expect(result).toHaveProperty('embedding');
    expect(result).toHaveProperty('usage');
    expect(result).toHaveProperty('response');
    expect(result.embedding).toBeInstanceOf(Float32Array);
    expect(result.embedding.length).toBe(512);
    expect(result.usage.tokens).toBeGreaterThan(0);
    expect(result.response.modelId).toBe('mock:multimodal-embedding');
    expect(result.response.timestamp).toBeInstanceOf(Date);
  });

  it('supports AbortSignal', async () => {
    const model = createMockMultimodalEmbeddingModel({ dimensions: 512, delay: 1000 });
    const controller = new AbortController();

    const promise = embedImage({
      model,
      image: 'https://example.com/cat.jpg',
      abortSignal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toThrow();
  });

  it('supports pre-aborted signal', async () => {
    const model = createMockMultimodalEmbeddingModel({ dimensions: 512 });
    const controller = new AbortController();
    controller.abort();

    await expect(
      embedImage({
        model,
        image: 'https://example.com/cat.jpg',
        abortSignal: controller.signal,
      })
    ).rejects.toThrow();
  });

  it('respects maxRetries option', async () => {
    const model = createMockMultimodalEmbeddingModel({
      dimensions: 512,
      failCount: 2,
    });

    const result = await embedImage({
      model,
      image: 'https://example.com/cat.jpg',
      maxRetries: 3,
    });

    expect(result.embedding).toBeDefined();
    expect(result.embedding.length).toBe(512);
  });

  it('throws after exhausting retries', async () => {
    const model = createMockMultimodalEmbeddingModel({
      dimensions: 512,
      failCount: 5,
    });

    await expect(
      embedImage({
        model,
        image: 'https://example.com/cat.jpg',
        maxRetries: 2,
      })
    ).rejects.toThrow();
  });

  it('accepts Blob as image input', async () => {
    const model = createMockMultimodalEmbeddingModel({ dimensions: 512 });
    const blob = new Blob(['fake image data'], { type: 'image/png' });

    const result = await embedImage({ model, image: blob });

    expect(result.embedding).toBeInstanceOf(Float32Array);
    expect(result.embedding.length).toBe(512);
  });

  it('accepts ArrayBuffer as image input', async () => {
    const model = createMockMultimodalEmbeddingModel({ dimensions: 512 });
    const buffer = new ArrayBuffer(100);

    const result = await embedImage({ model, image: buffer });

    expect(result.embedding).toBeInstanceOf(Float32Array);
    expect(result.embedding.length).toBe(512);
  });
});

describe('embedManyImages()', () => {
  it('returns embeddings for multiple images', async () => {
    const model = createMockMultimodalEmbeddingModel({ dimensions: 512 });

    const result = await embedManyImages({
      model,
      images: [
        'https://example.com/cat.jpg',
        'https://example.com/dog.jpg',
        'https://example.com/bird.jpg',
      ],
    });

    expect(result).toHaveProperty('embeddings');
    expect(result).toHaveProperty('usage');
    expect(result).toHaveProperty('response');
    expect(result.embeddings).toHaveLength(3);
    result.embeddings.forEach((emb) => {
      expect(emb).toBeInstanceOf(Float32Array);
      expect(emb.length).toBe(512);
    });
    expect(result.usage.tokens).toBe(3);
  });

  it('handles empty array', async () => {
    const model = createMockMultimodalEmbeddingModel({ dimensions: 512 });

    const result = await embedManyImages({
      model,
      images: [],
    });

    expect(result.embeddings).toHaveLength(0);
  });

  it('supports AbortSignal', async () => {
    const model = createMockMultimodalEmbeddingModel({ dimensions: 512, delay: 1000 });
    const controller = new AbortController();

    const promise = embedManyImages({
      model,
      images: ['https://example.com/cat.jpg', 'https://example.com/dog.jpg'],
      abortSignal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toThrow();
  });

  it('respects maxRetries', async () => {
    const model = createMockMultimodalEmbeddingModel({
      dimensions: 512,
      failCount: 1,
    });

    const result = await embedManyImages({
      model,
      images: ['https://example.com/cat.jpg'],
      maxRetries: 2,
    });

    expect(result.embeddings).toHaveLength(1);
  });
});

describe('cross-modal consistency', () => {
  it('text and image embeddings have same dimensions', async () => {
    const model = createMockMultimodalEmbeddingModel({ dimensions: 512 });

    const textResult = await model.doEmbed({
      values: ['a photo of a cat'],
    });

    const imageResult = await model.doEmbedImage({
      images: ['https://example.com/cat.jpg'],
    });

    expect(textResult.embeddings[0].length).toBe(512);
    expect(imageResult.embeddings[0].length).toBe(512);
    expect(textResult.embeddings[0].length).toBe(imageResult.embeddings[0].length);
  });

  it('model reports correct supported modalities', () => {
    const model = createMockMultimodalEmbeddingModel({
      supportedModalities: ['text', 'image'],
    });

    expect(model.supportedModalities).toContain('text');
    expect(model.supportedModalities).toContain('image');
    expect(model.supportedModalities).not.toContain('audio');
  });

  it('model works as standard EmbeddingModel for text', async () => {
    const model = createMockMultimodalEmbeddingModel({ dimensions: 512 });

    // Use the standard doEmbed interface
    const result = await model.doEmbed({
      values: ['hello world', 'foo bar'],
    });

    expect(result.embeddings).toHaveLength(2);
    expect(result.embeddings[0]).toBeInstanceOf(Float32Array);
    expect(result.embeddings[0].length).toBe(512);
    expect(result.usage.tokens).toBeGreaterThan(0);
    expect(result.response.modelId).toBe('mock:multimodal-embedding');
  });
});

describe('createMockMultimodalEmbeddingModel()', () => {
  it('creates with default options', () => {
    const model = createMockMultimodalEmbeddingModel();

    expect(model.modelId).toBe('mock:multimodal-embedding');
    expect(model.provider).toBe('mock');
    expect(model.dimensions).toBe(512);
    expect(model.supportedModalities).toEqual(['text', 'image']);
    expect(model.supportsParallelCalls).toBe(true);
  });

  it('respects custom options', () => {
    const model = createMockMultimodalEmbeddingModel({
      dimensions: 768,
      modelId: 'mock:custom-clip',
      supportedModalities: ['text', 'image', 'audio'],
    });

    expect(model.dimensions).toBe(768);
    expect(model.modelId).toBe('mock:custom-clip');
    expect(model.supportedModalities).toContain('audio');
  });

  it('produces deterministic embeddings from same seed', async () => {
    const model1 = createMockMultimodalEmbeddingModel({ seed: 123 });
    const model2 = createMockMultimodalEmbeddingModel({ seed: 123 });

    const result1 = await model1.doEmbedImage({ images: ['img1'] });
    const result2 = await model2.doEmbedImage({ images: ['img1'] });

    expect(result1.embeddings[0]).toEqual(result2.embeddings[0]);
  });

  it('tracks call counts', async () => {
    const model = createMockMultimodalEmbeddingModel();

    await model.doEmbed({ values: ['hello'] });
    await model.doEmbed({ values: ['world'] });
    await model.doEmbedImage({ images: ['img1'] });

    expect(model.textCallCount).toBe(2);
    expect(model.imageCallCount).toBe(1);

    model.resetCallCounts();
    expect(model.textCallCount).toBe(0);
    expect(model.imageCallCount).toBe(0);
  });
});
