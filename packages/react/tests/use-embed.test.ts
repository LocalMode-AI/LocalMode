import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createMockEmbeddingModel } from '@localmode/core';
import { useEmbed } from '../src/hooks/use-embed.js';
import { useEmbedMany } from '../src/hooks/use-embed-many.js';

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
