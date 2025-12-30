/**
 * Vision Tests
 *
 * Tests for classifyImage(), classifyImageZeroShot(), and captionImage() functions.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  classifyImage,
  classifyImageZeroShot,
  captionImage,
  type ImageClassificationModel,
  type ZeroShotImageClassificationModel,
  type ImageCaptionModel,
} from '../src/vision/index.js';

describe('Vision Functions', () => {
  describe('classifyImage()', () => {
    it('should classify an image', async () => {
      const mockModel: ImageClassificationModel = {
        modelId: 'test-image-classifier',
        provider: 'test',
        doClassify: vi.fn().mockResolvedValue({
          results: [
            [
              { label: 'cat', score: 0.85 },
              { label: 'dog', score: 0.1 },
              { label: 'bird', score: 0.05 },
            ],
          ],
          usage: { durationMs: 100 },
        }),
      };

      // Mock image URL (in real usage, this would be a Blob or ImageData)
      const result = await classifyImage({
        model: mockModel,
        image: 'https://example.com/cat.jpg',
      });

      expect(result.predictions).toHaveLength(3);
      expect(result.predictions[0]).toMatchObject({
        label: 'cat',
        score: 0.85,
      });
      expect(result.usage.durationMs).toBe(100);
      expect(result.response.modelId).toBe('test-image-classifier');
    });

    it('should handle Blob image input', async () => {
      const mockBlob = new Blob([new ArrayBuffer(100)], { type: 'image/jpeg' });

      const mockModel: ImageClassificationModel = {
        modelId: 'test-image-classifier',
        provider: 'test',
        doClassify: vi.fn().mockResolvedValue({
          results: [[{ label: 'dog', score: 0.9 }]],
          usage: { durationMs: 80 },
        }),
      };

      const result = await classifyImage({
        model: mockModel,
        image: mockBlob,
      });

      expect(result.predictions[0].label).toBe('dog');
    });

    it('should respect topK parameter', async () => {
      const mockModel: ImageClassificationModel = {
        modelId: 'test-image-classifier',
        provider: 'test',
        doClassify: vi.fn().mockResolvedValue({
          results: [
            [
              { label: 'cat', score: 0.9 },
              { label: 'dog', score: 0.08 },
            ],
          ],
          usage: { durationMs: 100 },
        }),
      };

      const result = await classifyImage({
        model: mockModel,
        image: 'test.jpg',
        topK: 2,
      });

      expect(mockModel.doClassify).toHaveBeenCalledWith(
        expect.objectContaining({ topK: 2 })
      );
      expect(result.predictions).toHaveLength(2);
    });

    it('should handle AbortSignal', async () => {
      const controller = new AbortController();
      controller.abort();

      const mockModel: ImageClassificationModel = {
        modelId: 'test-image-classifier',
        provider: 'test',
        doClassify: vi.fn(),
      };

      await expect(
        classifyImage({
          model: mockModel,
          image: 'test.jpg',
          abortSignal: controller.signal,
        })
      ).rejects.toThrow();
    });

    it('should retry on failure', async () => {
      const mockDoClassify = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue({
          results: [[{ label: 'cat', score: 0.9 }]],
          usage: { durationMs: 100 },
        });

      const mockModel: ImageClassificationModel = {
        modelId: 'test-image-classifier',
        provider: 'test',
        doClassify: mockDoClassify,
      };

      const result = await classifyImage({
        model: mockModel,
        image: 'test.jpg',
        maxRetries: 2,
      });

      expect(result.predictions[0].label).toBe('cat');
      expect(mockDoClassify).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const mockModel: ImageClassificationModel = {
        modelId: 'test-image-classifier',
        provider: 'test',
        doClassify: vi.fn().mockRejectedValue(new Error('Persistent error')),
      };

      await expect(
        classifyImage({
          model: mockModel,
          image: 'test.jpg',
          maxRetries: 2,
        })
      ).rejects.toThrow('Image classification failed after 3 attempts');
    });
  });

  describe('classifyImageZeroShot()', () => {
    it('should classify image with custom labels', async () => {
      const mockModel: ZeroShotImageClassificationModel = {
        modelId: 'test-zero-shot-image',
        provider: 'test',
        doClassifyZeroShot: vi.fn().mockResolvedValue({
          results: [
            {
              labels: ['a photo of a cat', 'a photo of a dog', 'a photo of a bird'],
              scores: [0.8, 0.15, 0.05],
            },
          ],
          usage: { durationMs: 150 },
        }),
      };

      const result = await classifyImageZeroShot({
        model: mockModel,
        image: 'test.jpg',
        candidateLabels: ['a photo of a cat', 'a photo of a dog', 'a photo of a bird'],
      });

      expect(result.labels).toEqual([
        'a photo of a cat',
        'a photo of a dog',
        'a photo of a bird',
      ]);
      expect(result.scores).toEqual([0.8, 0.15, 0.05]);
      expect(result.usage.durationMs).toBe(150);
    });

    it('should handle AbortSignal', async () => {
      const controller = new AbortController();
      controller.abort();

      const mockModel: ZeroShotImageClassificationModel = {
        modelId: 'test-zero-shot-image',
        provider: 'test',
        doClassifyZeroShot: vi.fn(),
      };

      await expect(
        classifyImageZeroShot({
          model: mockModel,
          image: 'test.jpg',
          candidateLabels: ['cat', 'dog'],
          abortSignal: controller.signal,
        })
      ).rejects.toThrow();
    });

    it('should throw after max retries when model throws', async () => {
      const mockModel: ZeroShotImageClassificationModel = {
        modelId: 'test-zero-shot-image',
        provider: 'test',
        doClassifyZeroShot: vi.fn().mockRejectedValue(new Error('Model error')),
      };

      await expect(
        classifyImageZeroShot({
          model: mockModel,
          image: 'test.jpg',
          candidateLabels: ['cat', 'dog'],
        })
      ).rejects.toThrow('Zero-shot image classification failed after 3 attempts');
    });
  });

  describe('captionImage()', () => {
    it('should generate caption for an image', async () => {
      const mockModel: ImageCaptionModel = {
        modelId: 'test-captioner',
        provider: 'test',
        doCaption: vi.fn().mockResolvedValue({
          captions: ['A fluffy orange cat sitting on a windowsill'],
          usage: { durationMs: 200 },
        }),
      };

      const result = await captionImage({
        model: mockModel,
        image: 'cat.jpg',
      });

      expect(result.caption).toBe('A fluffy orange cat sitting on a windowsill');
      expect(result.usage.durationMs).toBe(200);
      expect(result.response.modelId).toBe('test-captioner');
    });

    it('should respect maxLength parameter', async () => {
      const mockModel: ImageCaptionModel = {
        modelId: 'test-captioner',
        provider: 'test',
        doCaption: vi.fn().mockResolvedValue({
          captions: ['A cat'],
          usage: { durationMs: 150 },
        }),
      };

      const result = await captionImage({
        model: mockModel,
        image: 'cat.jpg',
        maxLength: 10,
      });

      expect(mockModel.doCaption).toHaveBeenCalledWith(
        expect.objectContaining({ maxLength: 10 })
      );
    });

    it('should handle AbortSignal', async () => {
      const controller = new AbortController();
      controller.abort();

      const mockModel: ImageCaptionModel = {
        modelId: 'test-captioner',
        provider: 'test',
        doCaption: vi.fn(),
      };

      await expect(
        captionImage({
          model: mockModel,
          image: 'test.jpg',
          abortSignal: controller.signal,
        })
      ).rejects.toThrow();
    });

    it('should retry on failure', async () => {
      const mockDoCaption = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue({
          captions: ['A retry successful caption'],
          usage: { durationMs: 200 },
        });

      const mockModel: ImageCaptionModel = {
        modelId: 'test-captioner',
        provider: 'test',
        doCaption: mockDoCaption,
      };

      const result = await captionImage({
        model: mockModel,
        image: 'test.jpg',
        maxRetries: 2,
      });

      expect(result.caption).toBe('A retry successful caption');
      expect(mockDoCaption).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const mockModel: ImageCaptionModel = {
        modelId: 'test-captioner',
        provider: 'test',
        doCaption: vi.fn().mockRejectedValue(new Error('Persistent error')),
      };

      await expect(
        captionImage({
          model: mockModel,
          image: 'test.jpg',
          maxRetries: 2,
        })
      ).rejects.toThrow('Image captioning failed after 3 attempts');
    });

    it('should track timestamps in response', async () => {
      const beforeTime = new Date();

      const mockModel: ImageCaptionModel = {
        modelId: 'test-captioner',
        provider: 'test',
        doCaption: vi.fn().mockResolvedValue({
          captions: ['Test caption'],
          usage: { durationMs: 100 },
        }),
      };

      const result = await captionImage({
        model: mockModel,
        image: 'test.jpg',
      });

      const afterTime = new Date();

      expect(result.response.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(result.response.timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });
});
