/**
 * @fileoverview Tests for differential privacy features
 *
 * Tests cover:
 * - Gaussian and Laplacian noise generation
 * - Noise statistical properties (mean, std dev)
 * - Privacy budget accounting
 * - DP embedding middleware integration
 * - Randomized response mechanism
 * - DP classification middleware
 * - Sensitivity calibration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  // Noise
  gaussianNoise,
  laplacianNoise,
  addNoise,
  // Sensitivity
  lookupSensitivity,
  getSensitivity,
  resolveSensitivity,
  // Budget
  createPrivacyBudget,
  // Middleware
  dpEmbeddingMiddleware,
  computeGaussianSigma,
  computeLaplacianScale,
  // Classification DP
  randomizedResponse,
  dpClassificationMiddleware,
  // Embedding middleware helpers
  wrapEmbeddingModel,
  // Mock utilities
  createMockEmbeddingModel,
  createMockClassificationModel,
  // Errors
  PrivacyBudgetExhaustedError,
} from '../src/index.js';

// ============================================================================
// Helper: Statistical functions
// ============================================================================

function mean(arr: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}

function stddev(arr: Float32Array, mu: number): number {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    const diff = arr[i] - mu;
    sum += diff * diff;
  }
  return Math.sqrt(sum / arr.length);
}

// ============================================================================
// Gaussian Noise Tests
// ============================================================================

describe('gaussianNoise()', () => {
  it('returns Float32Array of correct dimensions', () => {
    const noise = gaussianNoise(384, 1.0);
    expect(noise).toBeInstanceOf(Float32Array);
    expect(noise.length).toBe(384);
  });

  it('produces odd-length arrays correctly', () => {
    const noise = gaussianNoise(385, 1.0);
    expect(noise.length).toBe(385);
    // All values should be finite
    for (let i = 0; i < noise.length; i++) {
      expect(Number.isFinite(noise[i])).toBe(true);
    }
  });

  it('has mean approximately 0 (statistical test)', () => {
    // Large sample for stable statistics
    const noise = gaussianNoise(10000, 1.0);
    const m = mean(noise);
    // Mean should be close to 0 — allow tolerance for randomness
    expect(Math.abs(m)).toBeLessThan(0.1);
  });

  it('has standard deviation approximately sigma (statistical test)', () => {
    const sigma = 0.5;
    const noise = gaussianNoise(10000, sigma);
    const m = mean(noise);
    const sd = stddev(noise, m);
    // Std dev should be close to sigma — allow 20% tolerance
    expect(sd).toBeGreaterThan(sigma * 0.8);
    expect(sd).toBeLessThan(sigma * 1.2);
  });

  it('produces different values each call (randomness)', () => {
    const noise1 = gaussianNoise(100, 1.0);
    const noise2 = gaussianNoise(100, 1.0);
    // Extremely unlikely for two random vectors to be identical
    let allSame = true;
    for (let i = 0; i < noise1.length; i++) {
      if (noise1[i] !== noise2[i]) {
        allSame = false;
        break;
      }
    }
    expect(allSame).toBe(false);
  });

  it('scales with sigma', () => {
    const small = gaussianNoise(10000, 0.1);
    const large = gaussianNoise(10000, 10.0);

    const sdSmall = stddev(small, mean(small));
    const sdLarge = stddev(large, mean(large));

    // Large sigma should produce larger spread
    expect(sdLarge).toBeGreaterThan(sdSmall * 10);
  });
});

// ============================================================================
// Laplacian Noise Tests
// ============================================================================

describe('laplacianNoise()', () => {
  it('returns Float32Array of correct dimensions', () => {
    const noise = laplacianNoise(384, 1.0);
    expect(noise).toBeInstanceOf(Float32Array);
    expect(noise.length).toBe(384);
  });

  it('has mean approximately 0 (statistical test)', () => {
    const noise = laplacianNoise(10000, 1.0);
    const m = mean(noise);
    expect(Math.abs(m)).toBeLessThan(0.1);
  });

  it('has correct scale parameter (statistical test)', () => {
    // For Laplace(0, b), the variance is 2*b^2, so std dev = b*sqrt(2)
    const scale = 1.0;
    const noise = laplacianNoise(10000, scale);
    const m = mean(noise);
    const sd = stddev(noise, m);
    const expectedStd = scale * Math.sqrt(2);
    // Allow 20% tolerance
    expect(sd).toBeGreaterThan(expectedStd * 0.8);
    expect(sd).toBeLessThan(expectedStd * 1.2);
  });

  it('produces all finite values', () => {
    const noise = laplacianNoise(1000, 1.0);
    for (let i = 0; i < noise.length; i++) {
      expect(Number.isFinite(noise[i])).toBe(true);
    }
  });
});

// ============================================================================
// addNoise Tests
// ============================================================================

describe('addNoise()', () => {
  it('adds noise element-wise', () => {
    const embedding = new Float32Array([1.0, 2.0, 3.0]);
    const noise = new Float32Array([0.1, -0.2, 0.3]);
    const result = addNoise(embedding, noise);

    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(3);
    expect(result[0]).toBeCloseTo(1.1);
    expect(result[1]).toBeCloseTo(1.8);
    expect(result[2]).toBeCloseTo(3.3);
  });

  it('does not modify the original embedding', () => {
    const embedding = new Float32Array([1.0, 2.0, 3.0]);
    const noise = new Float32Array([0.1, -0.2, 0.3]);
    addNoise(embedding, noise);

    expect(embedding[0]).toBe(1.0);
    expect(embedding[1]).toBe(2.0);
    expect(embedding[2]).toBe(3.0);
  });
});

// ============================================================================
// Sensitivity Tests
// ============================================================================

describe('Sensitivity Calibration', () => {
  describe('lookupSensitivity()', () => {
    it('returns 2.0 for known models', () => {
      expect(lookupSensitivity('Xenova/bge-small-en-v1.5')).toBe(2.0);
      expect(lookupSensitivity('Xenova/all-MiniLM-L6-v2')).toBe(2.0);
      expect(lookupSensitivity('Xenova/all-mpnet-base-v2')).toBe(2.0);
    });

    it('returns undefined for unknown models', () => {
      expect(lookupSensitivity('unknown/model')).toBeUndefined();
    });
  });

  describe('getSensitivity()', () => {
    it('returns known sensitivity for known models', () => {
      expect(getSensitivity('Xenova/bge-small-en-v1.5')).toBe(2.0);
    });

    it('returns default 2.0 for unknown models', () => {
      expect(getSensitivity('unknown/model')).toBe(2.0);
    });

    it('returns default 2.0 when no model ID provided', () => {
      expect(getSensitivity()).toBe(2.0);
    });
  });

  describe('resolveSensitivity()', () => {
    it('returns explicit numeric value', () => {
      expect(resolveSensitivity(3.5)).toBe(3.5);
    });

    it('resolves auto with model ID lookup', () => {
      expect(resolveSensitivity('auto', 'Xenova/bge-small-en-v1.5')).toBe(2.0);
    });

    it('resolves auto without model ID to default', () => {
      expect(resolveSensitivity('auto')).toBe(2.0);
    });

    it('resolves undefined to default', () => {
      expect(resolveSensitivity(undefined)).toBe(2.0);
    });
  });
});

// ============================================================================
// Sigma / Scale Computation Tests
// ============================================================================

describe('Noise Parameter Computation', () => {
  describe('computeGaussianSigma()', () => {
    it('computes correct sigma', () => {
      const sensitivity = 2.0;
      const epsilon = 1.0;
      const delta = 1e-5;

      const sigma = computeGaussianSigma(sensitivity, epsilon, delta);

      // sigma = (2.0 * sqrt(2 * ln(1.25 / 1e-5))) / 1.0
      // = 2.0 * sqrt(2 * ln(125000))
      // = 2.0 * sqrt(2 * 11.736)
      // = 2.0 * sqrt(23.472)
      // ≈ 2.0 * 4.845
      // ≈ 9.69
      expect(sigma).toBeGreaterThan(9);
      expect(sigma).toBeLessThan(10.5);
    });

    it('sigma increases with smaller epsilon (more privacy)', () => {
      const sigma1 = computeGaussianSigma(2.0, 1.0, 1e-5);
      const sigma2 = computeGaussianSigma(2.0, 0.1, 1e-5);

      expect(sigma2).toBeGreaterThan(sigma1);
    });

    it('sigma increases with larger sensitivity', () => {
      const sigma1 = computeGaussianSigma(1.0, 1.0, 1e-5);
      const sigma2 = computeGaussianSigma(2.0, 1.0, 1e-5);

      expect(sigma2).toBeGreaterThan(sigma1);
    });
  });

  describe('computeLaplacianScale()', () => {
    it('computes correct scale', () => {
      expect(computeLaplacianScale(2.0, 1.0)).toBe(2.0);
      expect(computeLaplacianScale(2.0, 2.0)).toBe(1.0);
      expect(computeLaplacianScale(2.0, 0.5)).toBe(4.0);
    });
  });
});

// ============================================================================
// Privacy Budget Tests
// ============================================================================

describe('createPrivacyBudget()', () => {
  it('creates budget with full remaining', async () => {
    const budget = await createPrivacyBudget({
      maxEpsilon: 10.0,
    });

    expect(budget.remaining()).toBe(10.0);
    expect(budget.consumed()).toBe(0);
    expect(budget.isExhausted()).toBe(false);

    await budget.destroy();
  });

  it('consumes epsilon correctly', async () => {
    const budget = await createPrivacyBudget({
      maxEpsilon: 10.0,
    });

    budget.consume(3.0);
    expect(budget.remaining()).toBe(7.0);
    expect(budget.consumed()).toBe(3.0);

    budget.consume(2.0);
    expect(budget.remaining()).toBe(5.0);
    expect(budget.consumed()).toBe(5.0);

    await budget.destroy();
  });

  it('detects exhaustion', async () => {
    const budget = await createPrivacyBudget({
      maxEpsilon: 5.0,
    });

    budget.consume(5.0);
    expect(budget.isExhausted()).toBe(true);
    expect(budget.remaining()).toBe(0);

    await budget.destroy();
  });

  it('blocks when policy is block and budget exhausted', async () => {
    const budget = await createPrivacyBudget({
      maxEpsilon: 5.0,
      onExhausted: 'block',
    });

    budget.consume(4.0);

    // This should throw because consuming 2.0 more would exceed 5.0
    expect(() => budget.consume(2.0)).toThrow(PrivacyBudgetExhaustedError);
    // Budget should not have been consumed
    expect(budget.consumed()).toBe(4.0);
    expect(budget.remaining()).toBe(1.0);

    await budget.destroy();
  });

  it('warns when policy is warn and budget exhausted', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const budget = await createPrivacyBudget({
      maxEpsilon: 5.0,
      onExhausted: 'warn',
    });

    budget.consume(6.0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Privacy budget exhausted')
    );
    expect(budget.isExhausted()).toBe(true);
    // Budget was consumed despite warning
    expect(budget.consumed()).toBe(6.0);

    warnSpy.mockRestore();
    await budget.destroy();
  });

  it('resets budget to zero', async () => {
    const budget = await createPrivacyBudget({
      maxEpsilon: 10.0,
    });

    budget.consume(7.0);
    expect(budget.consumed()).toBe(7.0);

    budget.reset();
    expect(budget.consumed()).toBe(0);
    expect(budget.remaining()).toBe(10.0);
    expect(budget.isExhausted()).toBe(false);

    await budget.destroy();
  });

  it('throws on non-positive epsilon consumption', async () => {
    const budget = await createPrivacyBudget({
      maxEpsilon: 10.0,
    });

    expect(() => budget.consume(0)).toThrow('Epsilon must be positive');
    expect(() => budget.consume(-1)).toThrow('Epsilon must be positive');

    await budget.destroy();
  });
});

// ============================================================================
// DP Embedding Middleware Tests
// ============================================================================

describe('dpEmbeddingMiddleware()', () => {
  it('adds noise to embedding output (Gaussian)', async () => {
    const mockModel = createMockEmbeddingModel({ dimensions: 384 });

    const privateModel = wrapEmbeddingModel({
      model: mockModel,
      middleware: dpEmbeddingMiddleware({
        epsilon: 1.0,
        delta: 1e-5,
        mechanism: 'gaussian',
      }),
    });

    const original = await mockModel.doEmbed({ values: ['test'] });
    const private_ = await privateModel.doEmbed({ values: ['test'] });

    // Dimensions should match
    expect(private_.embeddings[0].length).toBe(384);

    // Values should be different (noise added)
    let anyDiff = false;
    for (let i = 0; i < 384; i++) {
      if (original.embeddings[0][i] !== private_.embeddings[0][i]) {
        anyDiff = true;
        break;
      }
    }
    expect(anyDiff).toBe(true);
  });

  it('adds noise to embedding output (Laplacian)', async () => {
    const mockModel = createMockEmbeddingModel({ dimensions: 384 });

    const privateModel = wrapEmbeddingModel({
      model: mockModel,
      middleware: dpEmbeddingMiddleware({
        epsilon: 1.0,
        mechanism: 'laplacian',
      }),
    });

    const original = await mockModel.doEmbed({ values: ['test'] });
    const private_ = await privateModel.doEmbed({ values: ['test'] });

    // Values should differ
    let anyDiff = false;
    for (let i = 0; i < 384; i++) {
      if (original.embeddings[0][i] !== private_.embeddings[0][i]) {
        anyDiff = true;
        break;
      }
    }
    expect(anyDiff).toBe(true);
  });

  it('handles multiple embeddings in one call', async () => {
    const mockModel = createMockEmbeddingModel({ dimensions: 128 });

    const privateModel = wrapEmbeddingModel({
      model: mockModel,
      middleware: dpEmbeddingMiddleware({ epsilon: 1.0 }),
    });

    const result = await privateModel.doEmbed({ values: ['hello', 'world'] });
    expect(result.embeddings.length).toBe(2);
    expect(result.embeddings[0].length).toBe(128);
    expect(result.embeddings[1].length).toBe(128);
  });

  it('consumes budget when budget is provided', async () => {
    const budget = await createPrivacyBudget({
      maxEpsilon: 10.0,
    });

    const mockModel = createMockEmbeddingModel({ dimensions: 128 });

    const privateModel = wrapEmbeddingModel({
      model: mockModel,
      middleware: dpEmbeddingMiddleware({ epsilon: 2.0 }, budget),
    });

    await privateModel.doEmbed({ values: ['test'] });
    expect(budget.consumed()).toBe(2.0);

    await privateModel.doEmbed({ values: ['test2'] });
    expect(budget.consumed()).toBe(4.0);

    await budget.destroy();
  });

  it('throws on invalid epsilon', () => {
    expect(() =>
      dpEmbeddingMiddleware({ epsilon: 0 })
    ).toThrow('Epsilon must be positive');

    expect(() =>
      dpEmbeddingMiddleware({ epsilon: -1 })
    ).toThrow('Epsilon must be positive');
  });

  it('throws on invalid delta for Gaussian', () => {
    expect(() =>
      dpEmbeddingMiddleware({ epsilon: 1.0, delta: 0, mechanism: 'gaussian' })
    ).toThrow('Delta must be positive');
  });

  it('preserves usage and response metadata', async () => {
    const mockModel = createMockEmbeddingModel({ dimensions: 128 });

    const privateModel = wrapEmbeddingModel({
      model: mockModel,
      middleware: dpEmbeddingMiddleware({ epsilon: 1.0 }),
    });

    const result = await privateModel.doEmbed({ values: ['test'] });
    expect(result.usage).toBeDefined();
    expect(result.usage.tokens).toBeGreaterThanOrEqual(0);
    expect(result.response).toBeDefined();
    expect(result.response.modelId).toBeDefined();
  });
});

// ============================================================================
// Randomized Response Tests
// ============================================================================

describe('randomizedResponse()', () => {
  const labels = ['positive', 'negative', 'neutral'];

  it('returns a valid label', () => {
    for (let i = 0; i < 100; i++) {
      const result = randomizedResponse('positive', labels, 1.0);
      expect(labels).toContain(result);
    }
  });

  it('returns true label with high probability for large epsilon', () => {
    let trueCount = 0;
    const trials = 1000;

    for (let i = 0; i < trials; i++) {
      const result = randomizedResponse('positive', labels, 10.0);
      if (result === 'positive') trueCount++;
    }

    // With epsilon=10 and 3 labels:
    // p(true) = e^10 / (e^10 + 2) ≈ 0.9999
    expect(trueCount / trials).toBeGreaterThan(0.99);
  });

  it('randomizes more with small epsilon', () => {
    let trueCount = 0;
    const trials = 1000;

    for (let i = 0; i < trials; i++) {
      const result = randomizedResponse('positive', labels, 0.1);
      if (result === 'positive') trueCount++;
    }

    // With epsilon=0.1 and 3 labels:
    // p(true) = e^0.1 / (e^0.1 + 2) ≈ 1.105 / 3.105 ≈ 0.356
    const expectedP = Math.exp(0.1) / (Math.exp(0.1) + 2);
    const observedP = trueCount / trials;
    expect(observedP).toBeGreaterThan(expectedP - 0.05);
    expect(observedP).toBeLessThan(expectedP + 0.05);
  });

  it('distributes other labels roughly uniformly', () => {
    const counts: Record<string, number> = { positive: 0, negative: 0, neutral: 0 };
    const trials = 3000;

    for (let i = 0; i < trials; i++) {
      const result = randomizedResponse('positive', labels, 0.01);
      counts[result]++;
    }

    // With very low epsilon, all labels should be roughly equal (1/3 each)
    for (const label of labels) {
      const proportion = counts[label] / trials;
      expect(proportion).toBeGreaterThan(0.2);
      expect(proportion).toBeLessThan(0.5);
    }
  });

  it('handles single label', () => {
    const result = randomizedResponse('only', ['only'], 1.0);
    expect(result).toBe('only');
  });

  it('handles two labels', () => {
    const twoLabels = ['yes', 'no'];
    let yesCount = 0;
    const trials = 1000;

    for (let i = 0; i < trials; i++) {
      const result = randomizedResponse('yes', twoLabels, 1.0);
      if (result === 'yes') yesCount++;
    }

    // p(true) = e^1 / (e^1 + 1) ≈ 0.731
    const expectedP = Math.exp(1) / (Math.exp(1) + 1);
    const observedP = yesCount / trials;
    expect(observedP).toBeGreaterThan(expectedP - 0.05);
    expect(observedP).toBeLessThan(expectedP + 0.05);
  });

  it('throws on empty labels', () => {
    expect(() => randomizedResponse('a', [], 1.0)).toThrow('allLabels must not be empty');
  });

  it('throws on non-positive epsilon', () => {
    expect(() => randomizedResponse('a', ['a', 'b'], 0)).toThrow('Epsilon must be positive');
    expect(() => randomizedResponse('a', ['a', 'b'], -1)).toThrow('Epsilon must be positive');
  });
});

// ============================================================================
// DP Classification Middleware Tests
// ============================================================================

describe('dpClassificationMiddleware()', () => {
  it('applies randomized response to classification results', async () => {
    const model = createMockClassificationModel();

    const middleware = dpClassificationMiddleware({
      epsilon: 0.01, // Very low epsilon for strong randomization
      labels: model.labels,
    });

    // Run many times and check that labels are randomized
    let changedCount = 0;
    const trials = 100;

    for (let i = 0; i < trials; i++) {
      const originalResult = await model.doClassify({ texts: ['test'] });
      const originalLabel = originalResult.results[0].label;

      // Apply middleware
      const wrappedResult = await middleware.wrapClassify!({
        doClassify: () => model.doClassify({ texts: ['test'] }),
        texts: ['test'],
        model,
      });

      const typedResult = wrappedResult as { results: Array<{ label: string }> };
      if (typedResult.results[0].label !== originalLabel) {
        changedCount++;
      }
    }

    // With very low epsilon, expect some changes
    expect(changedCount).toBeGreaterThan(0);
  });

  it('preserves results structure', async () => {
    const model = createMockClassificationModel();

    const middleware = dpClassificationMiddleware({
      epsilon: 10.0, // High epsilon, minimal randomization
      labels: model.labels,
    });

    const result = await middleware.wrapClassify!({
      doClassify: () => model.doClassify({ texts: ['test'] }),
      texts: ['test'],
      model,
    });

    const typedResult = result as {
      results: Array<{ label: string; score: number }>;
      usage: unknown;
    };

    expect(typedResult.results).toBeDefined();
    expect(typedResult.results.length).toBeGreaterThan(0);
    expect(typeof typedResult.results[0].label).toBe('string');
    expect(typeof typedResult.results[0].score).toBe('number');
    expect(typedResult.usage).toBeDefined();
  });

  it('throws on invalid config', () => {
    expect(() =>
      dpClassificationMiddleware({ epsilon: 0, labels: ['a'] })
    ).toThrow('Epsilon must be positive');

    expect(() =>
      dpClassificationMiddleware({ epsilon: 1.0, labels: [] })
    ).toThrow('Labels must not be empty');
  });
});

// ============================================================================
// PrivacyBudgetExhaustedError Tests
// ============================================================================

describe('PrivacyBudgetExhaustedError', () => {
  it('has correct properties', () => {
    const error = new PrivacyBudgetExhaustedError(10.0, 8.0);

    expect(error).toBeInstanceOf(PrivacyBudgetExhaustedError);
    expect(error.code).toBe('PRIVACY_BUDGET_EXHAUSTED');
    expect(error.maxEpsilon).toBe(10.0);
    expect(error.consumedEpsilon).toBe(8.0);
    expect(error.hint).toBeDefined();
    expect(error.message).toContain('Privacy budget exhausted');
  });
});
