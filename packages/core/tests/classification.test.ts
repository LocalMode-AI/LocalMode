/**
 * Classification Tests
 *
 * Tests for classify(), classifyMany(), and classifyZeroShot() functions.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  classify,
  classifyMany,
  classifyZeroShot,
  type ClassificationModel,
  type ZeroShotClassificationModel,
} from '../src/classification/index.js';

describe('Classification Functions', () => {
  describe('classify()', () => {
    it('should classify a single text', async () => {
      const mockModel: ClassificationModel = {
        modelId: 'test-classifier',
        provider: 'test',
        labels: ['positive', 'negative'],
        doClassify: vi.fn().mockResolvedValue({
          results: [{ label: 'positive', score: 0.9, allScores: { positive: 0.9, negative: 0.1 } }],
          usage: { inputTokens: 5, durationMs: 10 },
        }),
      };

      const result = await classify({
        model: mockModel,
        text: 'This is great!',
      });

      expect(result.label).toBe('positive');
      expect(result.score).toBe(0.9);
      expect(result.allScores).toEqual({ positive: 0.9, negative: 0.1 });
      expect(result.usage.inputTokens).toBe(5);
      expect(result.response.modelId).toBe('test-classifier');
    });

    it('should return highest scoring label', async () => {
      const mockModel: ClassificationModel = {
        modelId: 'test-classifier',
        provider: 'test',
        labels: ['positive', 'negative', 'neutral'],
        doClassify: vi.fn().mockResolvedValue({
          results: [{ label: 'negative', score: 0.6, allScores: { negative: 0.6, neutral: 0.2, positive: 0.2 } }],
          usage: { inputTokens: 5, durationMs: 10 },
        }),
      };

      const result = await classify({
        model: mockModel,
        text: 'Bad product',
      });

      expect(result.label).toBe('negative');
      expect(result.score).toBe(0.6);
    });

    it('should handle AbortSignal', async () => {
      const controller = new AbortController();
      controller.abort();

      const mockModel: ClassificationModel = {
        modelId: 'test-classifier',
        provider: 'test',
        labels: ['positive', 'negative'],
        doClassify: vi.fn(),
      };

      await expect(
        classify({
          model: mockModel,
          text: 'Test',
          abortSignal: controller.signal,
        })
      ).rejects.toThrow();
    });

    it('should retry on failure', async () => {
      const mockDoClassify = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue({
          results: [{ label: 'positive', score: 0.8 }],
          usage: { inputTokens: 5, durationMs: 10 },
        });

      const mockModel: ClassificationModel = {
        modelId: 'test-classifier',
        provider: 'test',
        labels: ['positive', 'negative'],
        doClassify: mockDoClassify,
      };

      const result = await classify({
        model: mockModel,
        text: 'Test',
        maxRetries: 2,
      });

      expect(result.label).toBe('positive');
      expect(mockDoClassify).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const mockModel: ClassificationModel = {
        modelId: 'test-classifier',
        provider: 'test',
        labels: ['positive', 'negative'],
        doClassify: vi.fn().mockRejectedValue(new Error('Persistent error')),
      };

      await expect(
        classify({
          model: mockModel,
          text: 'Test',
          maxRetries: 2,
        })
      ).rejects.toThrow('Classification failed after 3 attempts');
    });
  });

  describe('classifyMany()', () => {
    it('should classify multiple texts', async () => {
      const mockModel: ClassificationModel = {
        modelId: 'test-classifier',
        provider: 'test',
        labels: ['positive', 'negative'],
        doClassify: vi.fn().mockResolvedValue({
          results: [
            { label: 'positive', score: 0.9, allScores: { positive: 0.9, negative: 0.1 } },
            { label: 'negative', score: 0.8, allScores: { negative: 0.8, positive: 0.2 } },
          ],
          usage: { inputTokens: 10, durationMs: 20 },
        }),
      };

      const result = await classifyMany({
        model: mockModel,
        texts: ['Great product!', 'Terrible service'],
      });

      expect(result.results).toHaveLength(2);
      expect(result.results[0].label).toBe('positive');
      expect(result.results[1].label).toBe('negative');
      expect(result.usage.inputTokens).toBe(10);
    });

    it('should handle empty texts array', async () => {
      const mockModel: ClassificationModel = {
        modelId: 'test-classifier',
        provider: 'test',
        labels: ['positive', 'negative'],
        doClassify: vi.fn().mockResolvedValue({
          results: [],
          usage: { inputTokens: 0, durationMs: 1 },
        }),
      };

      const result = await classifyMany({
        model: mockModel,
        texts: [],
      });

      expect(result.results).toHaveLength(0);
    });
  });

  describe('classifyZeroShot()', () => {
    it('should classify with custom labels', async () => {
      const mockModel: ZeroShotClassificationModel = {
        modelId: 'test-zero-shot',
        provider: 'test',
        doClassifyZeroShot: vi.fn().mockResolvedValue({
          results: [
            {
              labels: ['technology', 'sports', 'politics'],
              scores: [0.8, 0.1, 0.1],
            },
          ],
          usage: { inputTokens: 10, durationMs: 15 },
        }),
      };

      const result = await classifyZeroShot({
        model: mockModel,
        text: 'The new AI model is groundbreaking',
        candidateLabels: ['technology', 'sports', 'politics'],
      });

      expect(result.labels).toEqual(['technology', 'sports', 'politics']);
      expect(result.scores).toEqual([0.8, 0.1, 0.1]);
      expect(result.usage.inputTokens).toBe(10);
    });

    it('should handle multi-label classification', async () => {
      const mockModel: ZeroShotClassificationModel = {
        modelId: 'test-zero-shot',
        provider: 'test',
        doClassifyZeroShot: vi.fn().mockResolvedValue({
          results: [
            {
              labels: ['urgent', 'technical', 'customer'],
              scores: [0.9, 0.85, 0.3],
            },
          ],
          usage: { inputTokens: 10, durationMs: 15 },
        }),
      };

      const result = await classifyZeroShot({
        model: mockModel,
        text: 'Urgent: Server is down!',
        candidateLabels: ['urgent', 'technical', 'customer'],
        multiLabel: true,
      });

      expect(result.labels).toContain('urgent');
      expect(result.labels).toContain('technical');
    });

    it('should handle AbortSignal', async () => {
      const controller = new AbortController();
      controller.abort();

      const mockModel: ZeroShotClassificationModel = {
        modelId: 'test-zero-shot',
        provider: 'test',
        doClassifyZeroShot: vi.fn(),
      };

      await expect(
        classifyZeroShot({
          model: mockModel,
          text: 'Test',
          candidateLabels: ['a', 'b'],
          abortSignal: controller.signal,
        })
      ).rejects.toThrow();
    });

    it('should throw after max retries when model throws', async () => {
      const mockModel: ZeroShotClassificationModel = {
        modelId: 'test-zero-shot',
        provider: 'test',
        doClassifyZeroShot: vi.fn().mockRejectedValue(new Error('Model error')),
      };

      await expect(
        classifyZeroShot({
          model: mockModel,
          text: 'Test',
          candidateLabels: ['a', 'b'],
        })
      ).rejects.toThrow('Zero-shot classification failed after 3 attempts');
    });
  });
});
