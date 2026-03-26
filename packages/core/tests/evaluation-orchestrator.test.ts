/**
 * Evaluation Orchestrator Tests
 *
 * Tests for the evaluateModel() orchestrator function.
 */

import { describe, it, expect, vi } from 'vitest';
import { evaluateModel } from '../src/evaluation/index.js';
import { accuracy } from '../src/evaluation/index.js';
import { ValidationError } from '../src/errors/index.js';

describe('evaluateModel()', () => {
  it('should evaluate a classifier with accuracy metric', async () => {
    const result = await evaluateModel({
      dataset: {
        inputs: ['good', 'bad', 'great'],
        expected: ['positive', 'negative', 'positive'],
      },
      predict: async (input: string) => {
        // Simple mock: 'good' and 'great' -> positive, 'bad' -> negative
        if (input === 'good' || input === 'great') return 'positive';
        return 'negative';
      },
      metric: accuracy,
    });

    expect(result.score).toBe(1.0);
    expect(result.predictions).toEqual(['positive', 'negative', 'positive']);
    expect(result.datasetSize).toBe(3);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should support AbortSignal cancellation', async () => {
    const controller = new AbortController();
    let callCount = 0;

    const promise = evaluateModel({
      dataset: {
        inputs: [1, 2, 3, 4, 5],
        expected: [1, 2, 3, 4, 5],
      },
      predict: async (input: number) => {
        callCount++;
        if (callCount === 2) {
          controller.abort();
        }
        return input;
      },
      metric: (predictions, expected) => {
        let correct = 0;
        for (let i = 0; i < predictions.length; i++) {
          if (predictions[i] === expected[i]) correct++;
        }
        return correct / predictions.length;
      },
      abortSignal: controller.signal,
    });

    await expect(promise).rejects.toThrow();
  });

  it('should call onProgress after each prediction', async () => {
    const onProgress = vi.fn();

    await evaluateModel({
      dataset: {
        inputs: ['a', 'b', 'c'],
        expected: ['a', 'b', 'c'],
      },
      predict: async (input: string) => input,
      metric: accuracy,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 3);
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 3);
    expect(onProgress).toHaveBeenNthCalledWith(3, 3, 3);
  });

  it('should throw ValidationError on empty dataset', async () => {
    await expect(
      evaluateModel({
        dataset: { inputs: [], expected: [] },
        predict: async (input: string) => input,
        metric: accuracy,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('should throw ValidationError on mismatched dataset lengths', async () => {
    await expect(
      evaluateModel({
        dataset: {
          inputs: [1, 2],
          expected: [1],
        },
        predict: async (input: number) => input,
        metric: (p, e) => 0,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('should report positive durationMs', async () => {
    const result = await evaluateModel({
      dataset: {
        inputs: ['a'],
        expected: ['a'],
      },
      predict: async (input: string) => input,
      metric: accuracy,
    });

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should pass AbortSignal to predict function', async () => {
    const predictFn = vi.fn().mockImplementation(async (input: string, signal: AbortSignal) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      return input;
    });

    await evaluateModel({
      dataset: {
        inputs: ['test'],
        expected: ['test'],
      },
      predict: predictFn,
      metric: accuracy,
    });

    expect(predictFn).toHaveBeenCalledTimes(1);
  });

  it('should compute correct score with custom metric', async () => {
    // Custom metric: returns the fraction of predictions > 5
    const customMetric = (predictions: number[], _expected: number[]) => {
      const above5 = predictions.filter((p) => p > 5).length;
      return above5 / predictions.length;
    };

    const result = await evaluateModel({
      dataset: {
        inputs: [1, 10, 3, 8],
        expected: [0, 0, 0, 0], // expected not used by this metric
      },
      predict: async (input: number) => input,
      metric: customMetric,
    });

    // 10 and 8 are > 5, so 2/4 = 0.5
    expect(result.score).toBe(0.5);
  });
});
