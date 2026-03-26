/**
 * @file reranker.test.ts
 * @description Tests for LocalModeReranker adapter
 */

import { describe, it, expect, vi } from 'vitest';
import { Document } from '@langchain/core/documents';
import { LocalModeReranker } from '../src/reranker.js';
import type { RerankerModel } from '@localmode/core';

function createMockRerankerModel(): RerankerModel {
  return {
    modelId: 'mock-reranker',
    provider: 'mock',
    doRerank: vi.fn(async ({ documents, topK }: { query: string; documents: string[]; topK?: number }) => {
      // Return documents in reverse order with descending scores
      const results = documents.map((_, i) => ({
        index: documents.length - 1 - i,
        score: 1 - i * 0.1,
      }));
      const limited = topK ? results.slice(0, topK) : results;
      return {
        results: limited,
        usage: { totalComparisons: documents.length },
      };
    }),
  };
}

describe('LocalModeReranker', () => {
  it('compressDocuments returns reranked Document[]', async () => {
    const model = createMockRerankerModel();
    const reranker = new LocalModeReranker({ model });

    const docs = [
      new Document({ pageContent: 'first', metadata: { idx: 0 } }),
      new Document({ pageContent: 'second', metadata: { idx: 1 } }),
      new Document({ pageContent: 'third', metadata: { idx: 2 } }),
    ];

    const result = await reranker.compressDocuments(docs, 'query');

    expect(result).toHaveLength(3);
    // Should be reranked (reversed by our mock)
    expect(result[0].pageContent).toBe('third');
    // Original metadata preserved
    expect(result[0].metadata.idx).toBe(2);
    // relevanceScore added
    expect(typeof result[0].metadata.relevanceScore).toBe('number');
  });

  it('topK limits returned documents', async () => {
    const model = createMockRerankerModel();
    const reranker = new LocalModeReranker({ model, topK: 2 });

    const docs = [
      new Document({ pageContent: 'a' }),
      new Document({ pageContent: 'b' }),
      new Document({ pageContent: 'c' }),
    ];

    const result = await reranker.compressDocuments(docs, 'query');
    expect(result).toHaveLength(2);
  });

  it('empty input returns empty array', async () => {
    const model = createMockRerankerModel();
    const reranker = new LocalModeReranker({ model });

    const result = await reranker.compressDocuments([], 'query');
    expect(result).toEqual([]);
    expect(model.doRerank).not.toHaveBeenCalled();
  });

  it('preserves original metadata', async () => {
    const model = createMockRerankerModel();
    const reranker = new LocalModeReranker({ model });

    const docs = [
      new Document({ pageContent: 'test', metadata: { source: 'doc.pdf', page: 3 } }),
    ];

    const result = await reranker.compressDocuments(docs, 'query');
    expect(result[0].metadata.source).toBe('doc.pdf');
    expect(result[0].metadata.page).toBe(3);
  });
});
