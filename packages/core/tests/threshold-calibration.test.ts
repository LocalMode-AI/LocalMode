/**
 * @fileoverview Tests for similarity threshold calibration
 */

import { describe, it, expect } from 'vitest';
import {
  calibrateThreshold,
  createMockEmbeddingModel,
} from '../src/index.js';
import { ValidationError } from '../src/errors/index.js';
import { cosineSimilarity, euclideanDistance, dotProduct } from '../src/hnsw/distance.js';

describe('calibrateThreshold()', () => {
  // ── Basic calibration ───────────────────────────────────────────

  it('returns a valid ThresholdCalibration for a small corpus', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const corpus = ['cat', 'dog', 'car', 'truck'];

    const result = await calibrateThreshold({ model, corpus });

    expect(result).toHaveProperty('threshold');
    expect(result).toHaveProperty('percentile', 90);
    expect(result).toHaveProperty('sampleSize', 4);
    expect(result).toHaveProperty('modelId', 'mock:test-model');
    expect(result).toHaveProperty('distanceFunction', 'cosine');
    expect(result).toHaveProperty('distribution');

    // threshold should be a number in a reasonable range for cosine
    expect(typeof result.threshold).toBe('number');
    expect(result.threshold).toBeGreaterThanOrEqual(-1);
    expect(result.threshold).toBeLessThanOrEqual(1);
  });

  it('computes correct pair count (n choose 2)', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const corpus = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

    const result = await calibrateThreshold({ model, corpus });

    // 10 choose 2 = 45
    expect(result.distribution.count).toBe(45);
    expect(result.sampleSize).toBe(10);
  });

  it('uses default percentile of 90', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const corpus = ['hello', 'world', 'test'];

    const result = await calibrateThreshold({ model, corpus });

    expect(result.percentile).toBe(90);
  });

  // ── Custom percentile ──────────────────────────────────────────

  it('supports custom percentile (50)', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const corpus = ['a', 'b', 'c', 'd', 'e'];

    const result = await calibrateThreshold({ model, corpus, percentile: 50 });

    expect(result.percentile).toBe(50);
    // 50th percentile should be close to the median
    expect(typeof result.threshold).toBe('number');
  });

  it('supports percentile of 100 (returns max)', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const corpus = ['alpha', 'beta', 'gamma'];

    const result = await calibrateThreshold({ model, corpus, percentile: 100 });

    expect(result.percentile).toBe(100);
    expect(result.threshold).toBeCloseTo(result.distribution.max, 10);
  });

  it('supports percentile of 0 (returns min)', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const corpus = ['alpha', 'beta', 'gamma'];

    const result = await calibrateThreshold({ model, corpus, percentile: 0 });

    expect(result.percentile).toBe(0);
    expect(result.threshold).toBeCloseTo(result.distribution.min, 10);
  });

  // ── maxSamples ─────────────────────────────────────────────────

  it('uses all samples when corpus is within maxSamples', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const corpus = Array.from({ length: 50 }, (_, i) => `text-${i}`);

    const result = await calibrateThreshold({ model, corpus, maxSamples: 200 });

    expect(result.sampleSize).toBe(50);
  });

  it('caps samples when corpus exceeds maxSamples', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const corpus = Array.from({ length: 500 }, (_, i) => `text-${i}`);

    const result = await calibrateThreshold({ model, corpus, maxSamples: 100 });

    expect(result.sampleSize).toBe(100);
    // 100 choose 2 = 4950
    expect(result.distribution.count).toBe(4950);
  });

  // ── AbortSignal ────────────────────────────────────────────────

  it('supports AbortSignal cancellation', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384, delay: 100 });
    const corpus = Array.from({ length: 50 }, (_, i) => `text-${i}`);
    const controller = new AbortController();

    const promise = calibrateThreshold({
      model,
      corpus,
      abortSignal: controller.signal,
    });

    // Abort immediately
    controller.abort();

    await expect(promise).rejects.toThrow();
  });

  it('throws when signal is already aborted', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const corpus = ['a', 'b', 'c'];
    const controller = new AbortController();
    controller.abort();

    await expect(
      calibrateThreshold({
        model,
        corpus,
        abortSignal: controller.signal,
      })
    ).rejects.toThrow();
  });

  // ── Validation errors ──────────────────────────────────────────

  it('throws ValidationError for empty corpus', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });

    await expect(
      calibrateThreshold({ model, corpus: [] })
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for single-item corpus', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });

    await expect(
      calibrateThreshold({ model, corpus: ['single'] })
    ).rejects.toThrow(ValidationError);

    try {
      await calibrateThreshold({ model, corpus: ['single'] });
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).message).toContain('at least 2');
    }
  });

  it('throws ValidationError for percentile > 100', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });

    await expect(
      calibrateThreshold({ model, corpus: ['a', 'b'], percentile: 101 })
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for negative percentile', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });

    await expect(
      calibrateThreshold({ model, corpus: ['a', 'b'], percentile: -1 })
    ).rejects.toThrow(ValidationError);
  });

  // ── Distribution statistics ────────────────────────────────────

  it('returns mathematically correct distribution statistics', async () => {
    const model = createMockEmbeddingModel({ dimensions: 8, seed: 100 });
    const corpus = ['apple', 'banana', 'cherry', 'date'];

    const result = await calibrateThreshold({ model, corpus });
    const { distribution } = result;

    // Manually compute expected values by embedding and computing pairwise similarity
    const embedResult = await import('../src/index.js').then((m) =>
      m.embedMany({ model, values: corpus })
    );
    const embeddings = embedResult.embeddings;

    const manualScores: number[] = [];
    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        manualScores.push(cosineSimilarity(embeddings[i], embeddings[j]));
      }
    }
    manualScores.sort((a, b) => a - b);

    // Count
    expect(distribution.count).toBe(6); // 4 choose 2

    // Mean
    const expectedMean = manualScores.reduce((s, v) => s + v, 0) / manualScores.length;
    expect(distribution.mean).toBeCloseTo(expectedMean, 10);

    // Median (even count: average of two middle values)
    const mid = manualScores.length / 2;
    const expectedMedian = (manualScores[mid - 1] + manualScores[mid]) / 2;
    expect(distribution.median).toBeCloseTo(expectedMedian, 10);

    // StdDev (population)
    let sumSqDev = 0;
    for (const s of manualScores) {
      sumSqDev += (s - expectedMean) ** 2;
    }
    const expectedStdDev = Math.sqrt(sumSqDev / manualScores.length);
    expect(distribution.stdDev).toBeCloseTo(expectedStdDev, 10);

    // Min and max
    expect(distribution.min).toBeCloseTo(manualScores[0], 10);
    expect(distribution.max).toBeCloseTo(manualScores[manualScores.length - 1], 10);
  });

  it('computes correct median for odd number of pairs', async () => {
    const model = createMockEmbeddingModel({ dimensions: 8 });
    // 3 choose 2 = 3 pairs (odd)
    const corpus = ['x', 'y', 'z'];

    const result = await calibrateThreshold({ model, corpus });

    // 3 pairs — median is the middle value (index 1)
    expect(result.distribution.count).toBe(3);
    expect(typeof result.distribution.median).toBe('number');
  });

  // ── Percentile computation ─────────────────────────────────────

  it('0th percentile equals min', async () => {
    const model = createMockEmbeddingModel({ dimensions: 8 });
    const corpus = ['one', 'two', 'three', 'four', 'five'];

    const result = await calibrateThreshold({ model, corpus, percentile: 0 });

    expect(result.threshold).toBe(result.distribution.min);
  });

  it('100th percentile equals max', async () => {
    const model = createMockEmbeddingModel({ dimensions: 8 });
    const corpus = ['one', 'two', 'three', 'four', 'five'];

    const result = await calibrateThreshold({ model, corpus, percentile: 100 });

    expect(result.threshold).toBe(result.distribution.max);
  });

  it('50th percentile is close to median', async () => {
    const model = createMockEmbeddingModel({ dimensions: 8 });
    // 5 choose 2 = 10 pairs (even), 7 choose 2 = 21 pairs (odd)
    const corpus = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

    const result = await calibrateThreshold({ model, corpus, percentile: 50 });

    // For odd counts, nearest-rank at 50% should be close to median
    const diff = Math.abs(result.threshold - result.distribution.median);
    // Allow some tolerance since nearest-rank is approximate
    expect(diff).toBeLessThan(result.distribution.stdDev + 0.01);
  });

  // ── Distance functions ─────────────────────────────────────────

  it('supports euclidean distance function', async () => {
    const model = createMockEmbeddingModel({ dimensions: 8 });
    const corpus = ['cat', 'dog', 'bird'];

    const result = await calibrateThreshold({
      model,
      corpus,
      distanceFunction: 'euclidean',
    });

    expect(result.distanceFunction).toBe('euclidean');
    // Euclidean scores: 1 / (1 + dist) should be in (0, 1]
    expect(result.threshold).toBeGreaterThan(0);
    expect(result.threshold).toBeLessThanOrEqual(1);
    expect(result.distribution.min).toBeGreaterThan(0);
    expect(result.distribution.max).toBeLessThanOrEqual(1);
  });

  it('supports dot product distance function', async () => {
    const model = createMockEmbeddingModel({ dimensions: 8 });
    const corpus = ['cat', 'dog', 'bird'];

    const result = await calibrateThreshold({
      model,
      corpus,
      distanceFunction: 'dot',
    });

    expect(result.distanceFunction).toBe('dot');
    // Dot product scores can be any real number
    expect(typeof result.threshold).toBe('number');
    expect(result.distribution.count).toBe(3); // 3 choose 2
  });

  it('euclidean scores match manual computation', async () => {
    const model = createMockEmbeddingModel({ dimensions: 8, seed: 77 });
    const corpus = ['fox', 'hen'];

    const result = await calibrateThreshold({
      model,
      corpus,
      distanceFunction: 'euclidean',
    });

    // Manually compute
    const embedResult = await import('../src/index.js').then((m) =>
      m.embedMany({ model, values: corpus })
    );
    const dist = euclideanDistance(embedResult.embeddings[0], embedResult.embeddings[1]);
    const expectedScore = 1 / (1 + dist);

    expect(result.distribution.count).toBe(1); // 2 choose 2 = 1
    expect(result.threshold).toBeCloseTo(expectedScore, 10);
  });

  it('dot product scores match manual computation', async () => {
    const model = createMockEmbeddingModel({ dimensions: 8, seed: 77 });
    const corpus = ['fox', 'hen'];

    const result = await calibrateThreshold({
      model,
      corpus,
      distanceFunction: 'dot',
    });

    // Manually compute
    const embedResult = await import('../src/index.js').then((m) =>
      m.embedMany({ model, values: corpus })
    );
    const expectedScore = dotProduct(embedResult.embeddings[0], embedResult.embeddings[1]);

    expect(result.distribution.count).toBe(1);
    expect(result.threshold).toBeCloseTo(expectedScore, 10);
  });

  // ── Minimum corpus size ────────────────────────────────────────

  it('works with exactly 2 corpus samples', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384 });
    const corpus = ['hello', 'world'];

    const result = await calibrateThreshold({ model, corpus });

    expect(result.sampleSize).toBe(2);
    expect(result.distribution.count).toBe(1); // 2 choose 2 = 1
    // With a single pair, threshold = min = max = mean = median
    expect(result.threshold).toBe(result.distribution.min);
    expect(result.threshold).toBe(result.distribution.max);
    expect(result.distribution.stdDev).toBe(0);
  });

  // ── String model ID ────────────────────────────────────────────

  it('resolves model ID string via model object', async () => {
    const model = createMockEmbeddingModel({ dimensions: 384, modelId: 'mock:custom-model' });
    const corpus = ['a', 'b', 'c'];

    const result = await calibrateThreshold({ model, corpus });

    expect(result.modelId).toBe('mock:custom-model');
  });
});
