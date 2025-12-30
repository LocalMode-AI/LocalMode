/**
 * Reranking Tests
 *
 * Tests for the rerank() function.
 */

import { describe, it, expect, vi } from 'vitest';
import { rerank, type RerankerModel } from '../src/classification/index.js';

describe('Reranking Functions', () => {
  describe('rerank()', () => {
    it('should rerank documents by relevance to query', async () => {
      const mockModel: RerankerModel = {
        modelId: 'test-reranker',
        provider: 'test',
        doRerank: vi.fn().mockResolvedValue({
          results: [
            { text: 'Python is a programming language', score: 0.95, index: 2 },
            { text: 'JavaScript is used for web development', score: 0.75, index: 1 },
            { text: 'The weather is nice today', score: 0.1, index: 0 },
          ],
          usage: { inputTokens: 30, durationMs: 50 },
        }),
      };

      const result = await rerank({
        model: mockModel,
        query: 'What is Python?',
        documents: [
          'The weather is nice today',
          'JavaScript is used for web development',
          'Python is a programming language',
        ],
      });

      expect(result.results).toHaveLength(3);
      expect(result.results[0].text).toBe('Python is a programming language');
      expect(result.results[0].score).toBe(0.95);
      expect(result.results[0].index).toBe(2);
      expect(result.usage.inputTokens).toBe(30);
      expect(result.response.modelId).toBe('test-reranker');
    });

    it('should respect topK parameter', async () => {
      const mockModel: RerankerModel = {
        modelId: 'test-reranker',
        provider: 'test',
        doRerank: vi.fn().mockResolvedValue({
          results: [
            { text: 'Most relevant', score: 0.9, index: 0 },
            { text: 'Second most relevant', score: 0.8, index: 1 },
          ],
          usage: { inputTokens: 20, durationMs: 30 },
        }),
      };

      const result = await rerank({
        model: mockModel,
        query: 'Test query',
        documents: ['Most relevant', 'Second most relevant', 'Third doc', 'Fourth doc'],
        topK: 2,
      });

      expect(result.results).toHaveLength(2);
      expect(mockModel.doRerank).toHaveBeenCalledWith(
        expect.objectContaining({ topK: 2 })
      );
    });

    it('should handle AbortSignal', async () => {
      const controller = new AbortController();
      controller.abort();

      const mockModel: RerankerModel = {
        modelId: 'test-reranker',
        provider: 'test',
        doRerank: vi.fn(),
      };

      await expect(
        rerank({
          model: mockModel,
          query: 'Test',
          documents: ['Doc 1', 'Doc 2'],
          abortSignal: controller.signal,
        })
      ).rejects.toThrow();
    });

    it('should retry on failure', async () => {
      const mockDoRerank = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue({
          results: [{ text: 'Test doc', score: 0.9, index: 0 }],
          usage: { inputTokens: 10, durationMs: 20 },
        });

      const mockModel: RerankerModel = {
        modelId: 'test-reranker',
        provider: 'test',
        doRerank: mockDoRerank,
      };

      const result = await rerank({
        model: mockModel,
        query: 'Test',
        documents: ['Test doc'],
        maxRetries: 2,
      });

      expect(result.results).toHaveLength(1);
      expect(mockDoRerank).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const mockModel: RerankerModel = {
        modelId: 'test-reranker',
        provider: 'test',
        doRerank: vi.fn().mockRejectedValue(new Error('Persistent error')),
      };

      await expect(
        rerank({
          model: mockModel,
          query: 'Test',
          documents: ['Doc 1'],
          maxRetries: 2,
        })
      ).rejects.toThrow('Reranking failed after 3 attempts');
    });

    it('should handle empty documents array', async () => {
      const mockModel: RerankerModel = {
        modelId: 'test-reranker',
        provider: 'test',
        doRerank: vi.fn().mockResolvedValue({
          results: [],
          usage: { inputTokens: 5, durationMs: 5 },
        }),
      };

      const result = await rerank({
        model: mockModel,
        query: 'Test',
        documents: [],
      });

      expect(result.results).toHaveLength(0);
    });

    it('should preserve original document indices', async () => {
      const mockModel: RerankerModel = {
        modelId: 'test-reranker',
        provider: 'test',
        doRerank: vi.fn().mockResolvedValue({
          results: [
            { text: 'Third doc', score: 0.9, index: 2 },
            { text: 'First doc', score: 0.5, index: 0 },
            { text: 'Second doc', score: 0.3, index: 1 },
          ],
          usage: { inputTokens: 15, durationMs: 25 },
        }),
      };

      const result = await rerank({
        model: mockModel,
        query: 'Test',
        documents: ['First doc', 'Second doc', 'Third doc'],
      });

      // Verify indices are preserved correctly
      expect(result.results[0].index).toBe(2);
      expect(result.results[1].index).toBe(0);
      expect(result.results[2].index).toBe(1);
    });

    it('should track timestamps in response', async () => {
      const beforeTime = new Date();

      const mockModel: RerankerModel = {
        modelId: 'test-reranker',
        provider: 'test',
        doRerank: vi.fn().mockResolvedValue({
          results: [{ text: 'Test', score: 0.9, index: 0 }],
          usage: { inputTokens: 5, durationMs: 10 },
        }),
      };

      const result = await rerank({
        model: mockModel,
        query: 'Test',
        documents: ['Test'],
      });

      const afterTime = new Date();

      expect(result.response.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(result.response.timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });
});
