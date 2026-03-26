/**
 * @file embeddings.test.ts
 * @description Tests for LocalModeEmbeddings adapter
 */

import { describe, it, expect } from 'vitest';
import { createMockEmbeddingModel } from '@localmode/core';
import { LocalModeEmbeddings } from '../src/embeddings.js';

describe('LocalModeEmbeddings', () => {
  const mockModel = createMockEmbeddingModel({ dimensions: 4 });
  const embeddings = new LocalModeEmbeddings({ model: mockModel });

  it('embedDocuments returns number[][]', async () => {
    const result = await embeddings.embedDocuments(['hello', 'world']);

    expect(result).toHaveLength(2);
    expect(Array.isArray(result[0])).toBe(true);
    expect(typeof result[0][0]).toBe('number');
    // Should NOT be Float32Array
    expect(result[0]).not.toBeInstanceOf(Float32Array);
  });

  it('embedQuery returns number[]', async () => {
    const result = await embeddings.embedQuery('test');

    expect(Array.isArray(result)).toBe(true);
    expect(typeof result[0]).toBe('number');
    expect(result).not.toBeInstanceOf(Float32Array);
  });

  it('embedDocuments with empty array returns []', async () => {
    const result = await embeddings.embedDocuments([]);
    expect(result).toEqual([]);
  });

  it('values match mock model output dimensions', async () => {
    const result = await embeddings.embedQuery('test');
    expect(result).toHaveLength(4);
  });
});
