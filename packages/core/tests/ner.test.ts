/**
 * Named Entity Recognition (NER) Tests
 *
 * Tests for extractEntities() and extractEntitiesMany() functions.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  extractEntities,
  extractEntitiesMany,
  type NERModel,
} from '../src/classification/index.js';

describe('NER Functions', () => {
  describe('extractEntities()', () => {
    it('should extract entities from text', async () => {
      const mockModel: NERModel = {
        modelId: 'test-ner',
        provider: 'test',
        entityTypes: ['PERSON', 'ORG', 'LOC'],
        doExtract: vi.fn().mockResolvedValue({
          results: [
            {
              entities: [
                { text: 'John', type: 'PERSON', score: 0.95, start: 0, end: 4 },
                { text: 'Microsoft', type: 'ORG', score: 0.92, start: 14, end: 23 },
                { text: 'Seattle', type: 'LOC', score: 0.88, start: 27, end: 34 },
              ],
            },
          ],
          usage: { inputTokens: 8, durationMs: 15 },
        }),
      };

      const result = await extractEntities({
        model: mockModel,
        text: 'John works at Microsoft in Seattle',
      });

      expect(result.entities).toHaveLength(3);
      expect(result.entities[0]).toMatchObject({
        text: 'John',
        type: 'PERSON',
        score: 0.95,
      });
      expect(result.entities[1]).toMatchObject({
        text: 'Microsoft',
        type: 'ORG',
      });
      expect(result.entities[2]).toMatchObject({
        text: 'Seattle',
        type: 'LOC',
      });
      expect(result.usage.inputTokens).toBe(8);
      expect(result.response.modelId).toBe('test-ner');
    });

    it('should handle text with no entities', async () => {
      const mockModel: NERModel = {
        modelId: 'test-ner',
        provider: 'test',
        entityTypes: ['PERSON', 'ORG', 'LOC'],
        doExtract: vi.fn().mockResolvedValue({
          results: [{ entities: [] }],
          usage: { inputTokens: 5, durationMs: 10 },
        }),
      };

      const result = await extractEntities({
        model: mockModel,
        text: 'Hello world',
      });

      expect(result.entities).toHaveLength(0);
    });

    it('should handle AbortSignal', async () => {
      const controller = new AbortController();
      controller.abort();

      const mockModel: NERModel = {
        modelId: 'test-ner',
        provider: 'test',
        entityTypes: ['PERSON', 'ORG', 'LOC'],
        doExtract: vi.fn(),
      };

      await expect(
        extractEntities({
          model: mockModel,
          text: 'John works at Microsoft',
          abortSignal: controller.signal,
        })
      ).rejects.toThrow();
    });

    it('should retry on failure', async () => {
      const mockDoExtract = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue({
          results: [{ entities: [{ text: 'John', type: 'PERSON', score: 0.9, start: 0, end: 4 }] }],
          usage: { inputTokens: 5, durationMs: 10 },
        });

      const mockModel: NERModel = {
        modelId: 'test-ner',
        provider: 'test',
        entityTypes: ['PERSON', 'ORG', 'LOC'],
        doExtract: mockDoExtract,
      };

      const result = await extractEntities({
        model: mockModel,
        text: 'John',
        maxRetries: 2,
      });

      expect(result.entities).toHaveLength(1);
      expect(mockDoExtract).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const mockModel: NERModel = {
        modelId: 'test-ner',
        provider: 'test',
        entityTypes: ['PERSON', 'ORG', 'LOC'],
        doExtract: vi.fn().mockRejectedValue(new Error('Persistent error')),
      };

      await expect(
        extractEntities({
          model: mockModel,
          text: 'Test',
          maxRetries: 2,
        })
      ).rejects.toThrow('Entity extraction failed after 3 attempts');
    });
  });

  describe('extractEntitiesMany()', () => {
    it('should extract entities from multiple texts', async () => {
      const mockModel: NERModel = {
        modelId: 'test-ner',
        provider: 'test',
        entityTypes: ['PERSON', 'ORG', 'LOC'],
        doExtract: vi.fn().mockResolvedValue({
          results: [
            { entities: [{ text: 'John', type: 'PERSON', score: 0.95, start: 0, end: 4 }] },
            {
              entities: [
                { text: 'Apple', type: 'ORG', score: 0.9, start: 0, end: 5 },
                { text: 'Tim Cook', type: 'PERSON', score: 0.92, start: 10, end: 18 },
              ],
            },
          ],
          usage: { inputTokens: 15, durationMs: 25 },
        }),
      };

      const result = await extractEntitiesMany({
        model: mockModel,
        texts: ['John is a developer', 'Apple CEO Tim Cook announced...'],
      });

      expect(result.results).toHaveLength(2);
      expect(result.results[0].entities).toHaveLength(1);
      expect(result.results[1].entities).toHaveLength(2);
      expect(result.usage.inputTokens).toBe(15);
    });

    it('should handle empty texts array', async () => {
      const mockModel: NERModel = {
        modelId: 'test-ner',
        provider: 'test',
        entityTypes: ['PERSON', 'ORG', 'LOC'],
        doExtract: vi.fn().mockResolvedValue({
          results: [],
          usage: { inputTokens: 0, durationMs: 1 },
        }),
      };

      const result = await extractEntitiesMany({
        model: mockModel,
        texts: [],
      });

      expect(result.results).toHaveLength(0);
    });

    it('should track timestamps in response', async () => {
      const beforeTime = new Date();

      const mockModel: NERModel = {
        modelId: 'test-ner',
        provider: 'test',
        entityTypes: ['PERSON', 'ORG', 'LOC'],
        doExtract: vi.fn().mockResolvedValue({
          results: [{ entities: [] }],
          usage: { inputTokens: 5, durationMs: 10 },
        }),
      };

      const result = await extractEntitiesMany({
        model: mockModel,
        texts: ['Test'],
      });

      const afterTime = new Date();

      expect(result.response.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(result.response.timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });
});
