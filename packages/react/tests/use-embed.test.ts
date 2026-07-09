import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createMockEmbeddingModel, createMockMultimodalEmbeddingModel } from '@localmode/core';
import { useEmbed } from '../src/hooks/use-embed.js';
import { useEmbedMany } from '../src/hooks/use-embed-many.js';
import { useEmbedManyImages } from '../src/hooks/use-embed-many-images.js';

describe('useEmbed', () => {
  it('embeds a single value', async () => {
    const model = createMockEmbeddingModel();
    const { result } = renderHook(() => useEmbed({ model }));

    await act(async () => {
      await result.current.execute('Hello world');
    });

    expect(result.current.data).not.toBeNull();
    expect(result.current.data?.embedding).toBeInstanceOf(Float32Array);
    expect(result.current.data?.embedding.length).toBe(384);
    expect(result.current.data?.usage.tokens).toBeGreaterThan(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('handles errors', async () => {
    const model = createMockEmbeddingModel({ failCount: 999 });
    const { result } = renderHook(() => useEmbed({ model }));

    await act(async () => {
      await result.current.execute('test');
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.data).toBeNull();
  });
});

describe('useEmbedMany', () => {
  it('embeds multiple values', async () => {
    const model = createMockEmbeddingModel();
    const { result } = renderHook(() => useEmbedMany({ model }));

    await act(async () => {
      await result.current.execute(['Hello', 'World']);
    });

    expect(result.current.data).not.toBeNull();
    expect(result.current.data?.embeddings.length).toBe(2);
    expect(result.current.data?.embeddings[0]).toBeInstanceOf(Float32Array);
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useEmbedManyImages', () => {
  it('embeds multiple images with progress tracking (parity with useEmbedMany)', async () => {
    const model = createMockMultimodalEmbeddingModel({ dimensions: 512 });
    const { result } = renderHook(() => useEmbedManyImages({ model, batchSize: 2 }));

    expect(result.current.progress).toBeNull();

    await act(async () => {
      await result.current.execute([
        'https://example.com/a.jpg',
        'https://example.com/b.jpg',
        'https://example.com/c.jpg',
      ]);
    });

    expect(result.current.data).not.toBeNull();
    expect(result.current.data?.embeddings.length).toBe(3);
    expect(result.current.data?.embeddings[0]).toBeInstanceOf(Float32Array);
    expect(result.current.data?.embeddings[0].length).toBe(512);
    expect(result.current.data?.usage.tokens).toBeGreaterThan(0);
    // Progress shape matches useEmbedMany: { completed, total }
    expect(result.current.progress).toEqual({ completed: 3, total: 3 });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('handles errors as a real Error and keeps data null', async () => {
    const model = createMockMultimodalEmbeddingModel({ failCount: 999 });
    const { result } = renderHook(() => useEmbedManyImages({ model }));

    await act(async () => {
      await result.current.execute(['https://example.com/a.jpg']);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('reset() clears data, error, and progress', async () => {
    const model = createMockMultimodalEmbeddingModel({ dimensions: 512 });
    const { result } = renderHook(() => useEmbedManyImages({ model }));

    await act(async () => {
      await result.current.execute(['https://example.com/a.jpg']);
    });
    expect(result.current.data).not.toBeNull();

    act(() => {
      result.current.reset();
    });
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.progress).toBeNull();
  });
});
