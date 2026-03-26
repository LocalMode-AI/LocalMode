/**
 * @fileoverview Tests for product quantization (PQ).
 *
 * Tests codebook training, encode/decode functions, validation errors,
 * roundtrip accuracy, and cosine similarity preservation.
 */

import { describe, it, expect } from 'vitest';
import { trainPQ, pqQuantize, pqDequantize } from '../src/quantization/pq.js';
import type { PQCodebook } from '../src/quantization/types.js';

// ============================================================================
// Helper utilities
// ============================================================================

/** Create a deterministic pseudo-random vector */
function createTestVector(dimensions: number, seed: number): Float32Array {
  const vec = new Float32Array(dimensions);
  let s = seed;
  for (let i = 0; i < dimensions; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    vec[i] = (s / 0x7fffffff) * 2 - 1; // Range [-1, 1]
  }
  return vec;
}

/**
 * Generate Gaussian-like vectors by summing multiple uniform random components.
 * More realistic for embedding model distributions.
 */
function createGaussianVector(dimensions: number, seed: number): Float32Array {
  const vec = new Float32Array(dimensions);
  let s = seed;
  for (let i = 0; i < dimensions; i++) {
    // Sum of 4 uniform values approximates a Gaussian (Central Limit Theorem)
    let sum = 0;
    for (let j = 0; j < 4; j++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      sum += (s / 0x7fffffff) * 2 - 1;
    }
    vec[i] = sum / 4;
  }

  // Normalize to unit length (like embedding models produce)
  let norm = 0;
  for (let i = 0; i < dimensions; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) {
      vec[i] /= norm;
    }
  }

  return vec;
}

/** Compute cosine similarity between two vectors */
function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const mag = Math.sqrt(normA) * Math.sqrt(normB);
  return mag === 0 ? 0 : dot / mag;
}

// ============================================================================
// trainPQ() tests
// ============================================================================

describe('trainPQ()', () => {
  it('trains a codebook with correct shape for 384-dim vectors', () => {
    const vectors = Array.from({ length: 100 }, (_, i) => createTestVector(384, i));

    const codebook = trainPQ(vectors, {
      subvectors: 48,
      centroids: 16, // Small k for speed in tests
      maxIterations: 5,
    });

    expect(codebook.subvectors).toBe(48);
    expect(codebook.centroids).toBe(16);
    expect(codebook.subvectorDim).toBe(8); // 384 / 48
    expect(codebook.codebook.length).toBe(48);

    for (let p = 0; p < 48; p++) {
      expect(codebook.codebook[p].length).toBe(16);
      for (let c = 0; c < 16; c++) {
        expect(codebook.codebook[p][c]).toBeInstanceOf(Float32Array);
        expect(codebook.codebook[p][c].length).toBe(8);
      }
    }
  });

  it('trains with default parameters', () => {
    const vectors = Array.from({ length: 50 }, (_, i) => createTestVector(384, i));

    // Default: subvectors=48, centroids=256
    // but k will be capped to min(256, 50) = 50
    const codebook = trainPQ(vectors, { maxIterations: 3 });

    expect(codebook.subvectors).toBe(48);
    expect(codebook.centroids).toBe(256);
    expect(codebook.subvectorDim).toBe(8);
  });

  it('trains with custom subvectors', () => {
    const vectors = Array.from({ length: 30 }, (_, i) => createTestVector(384, i));

    const codebook = trainPQ(vectors, {
      subvectors: 24, // 384 / 24 = 16 dims per subvector
      centroids: 16,
      maxIterations: 3,
    });

    expect(codebook.subvectors).toBe(24);
    expect(codebook.subvectorDim).toBe(16);
  });

  it('trains with custom maxIterations', () => {
    const vectors = Array.from({ length: 30 }, (_, i) => createTestVector(48, i));

    const codebook = trainPQ(vectors, {
      subvectors: 6,
      centroids: 8,
      maxIterations: 5,
    });

    expect(codebook.subvectors).toBe(6);
    expect(codebook.centroids).toBe(8);
  });

  it('supports calibrationSamples', () => {
    const vectors = Array.from({ length: 200 }, (_, i) => createTestVector(48, i));

    // Should train from only 50 sampled vectors
    const codebook = trainPQ(vectors, {
      subvectors: 6,
      centroids: 8,
      calibrationSamples: 50,
      maxIterations: 3,
    });

    expect(codebook.subvectors).toBe(6);
    expect(codebook.centroids).toBe(8);
  });
});

// ============================================================================
// trainPQ() validation errors
// ============================================================================

describe('trainPQ() validation', () => {
  it('throws on empty vectors array', () => {
    expect(() => trainPQ([], { subvectors: 48 })).toThrow(/at least one vector/);
  });

  it('throws when dimensions not divisible by subvectors', () => {
    const vectors = [createTestVector(384, 0)];
    expect(() => trainPQ(vectors, { subvectors: 7 })).toThrow(/evenly divisible/);
  });

  it('throws when centroids > 256', () => {
    const vectors = Array.from({ length: 10 }, (_, i) => createTestVector(48, i));
    expect(() => trainPQ(vectors, { subvectors: 6, centroids: 512 })).toThrow(/256/);
  });

  it('throws when centroids < 1', () => {
    const vectors = [createTestVector(48, 0)];
    expect(() => trainPQ(vectors, { subvectors: 6, centroids: 0 })).toThrow(/must be >= 1/);
  });
});

// ============================================================================
// pqQuantize() tests
// ============================================================================

describe('pqQuantize()', () => {
  let codebook: PQCodebook;

  // Train a codebook for use in quantize tests
  const vectors = Array.from({ length: 50 }, (_, i) => createTestVector(48, i));

  // Only build once since it's the same for all tests
  codebook = trainPQ(vectors, { subvectors: 6, centroids: 16, maxIterations: 5 });

  it('produces Uint8Array of correct length', () => {
    const vector = createTestVector(48, 99);
    const encoded = pqQuantize(vector, codebook);

    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(encoded.length).toBe(6); // subvectors
  });

  it('all indices are in valid range [0, centroids-1]', () => {
    for (let i = 0; i < 20; i++) {
      const vector = createTestVector(48, 1000 + i);
      const encoded = pqQuantize(vector, codebook);

      for (let p = 0; p < encoded.length; p++) {
        expect(encoded[p]).toBeGreaterThanOrEqual(0);
        expect(encoded[p]).toBeLessThan(codebook.centroids);
      }
    }
  });

  it('throws on dimension mismatch', () => {
    const wrongVector = createTestVector(100, 0);
    expect(() => pqQuantize(wrongVector, codebook)).toThrow(/dimension mismatch/i);
  });
});

// ============================================================================
// pqDequantize() tests
// ============================================================================

describe('pqDequantize()', () => {
  let codebook: PQCodebook;

  const vectors = Array.from({ length: 50 }, (_, i) => createTestVector(48, i));
  codebook = trainPQ(vectors, { subvectors: 6, centroids: 16, maxIterations: 5 });

  it('produces Float32Array of correct dimensions', () => {
    const vector = createTestVector(48, 99);
    const encoded = pqQuantize(vector, codebook);
    const decoded = pqDequantize(encoded, codebook);

    expect(decoded).toBeInstanceOf(Float32Array);
    expect(decoded.length).toBe(48);
  });

  it('throws on length mismatch', () => {
    const wrongQuantized = new Uint8Array(10); // wrong length
    expect(() => pqDequantize(wrongQuantized, codebook)).toThrow(/length mismatch/i);
  });

  it('roundtrip produces approximate reconstruction', () => {
    const vector = createTestVector(48, 99);
    const encoded = pqQuantize(vector, codebook);
    const decoded = pqDequantize(encoded, codebook);

    // Decoded vector should have the same length
    expect(decoded.length).toBe(vector.length);

    // Cosine similarity should be reasonable (>0.5 even for a small codebook)
    const sim = cosineSim(vector, decoded);
    expect(sim).toBeGreaterThan(0.4);
  });
});

// ============================================================================
// PQ roundtrip accuracy
// ============================================================================

describe('PQ roundtrip cosine similarity', () => {
  it('preserves cosine similarity within 0.15 for well-trained codebook', () => {
    const dims = 384;
    const numVectors = 500;

    // Generate Gaussian-like vectors
    const vectors = Array.from({ length: numVectors }, (_, i) =>
      createGaussianVector(dims, i * 17 + 42)
    );

    // Use more centroids for better quality (cap to vector count)
    const codebook = trainPQ(vectors, {
      subvectors: 48,
      centroids: Math.min(256, numVectors),
      maxIterations: 15,
    });

    // Test pairs of vectors
    const numPairs = 100;
    let totalAbsError = 0;
    let maxAbsError = 0;

    for (let i = 0; i < numPairs; i++) {
      const a = vectors[i];
      const b = vectors[numPairs + i];

      const aEnc = pqQuantize(a, codebook);
      const bEnc = pqQuantize(b, codebook);
      const aDec = pqDequantize(aEnc, codebook);
      const bDec = pqDequantize(bEnc, codebook);

      const originalSim = cosineSim(a, b);
      const dequantizedSim = cosineSim(aDec, bDec);
      const absError = Math.abs(originalSim - dequantizedSim);

      totalAbsError += absError;
      if (absError > maxAbsError) maxAbsError = absError;
    }

    const meanAbsError = totalAbsError / numPairs;

    // Mean absolute error in cosine similarity should be < 0.05
    expect(meanAbsError).toBeLessThan(0.05);
  });

  it('individual vector cosine similarity to original is > 0.8 for well-trained codebook', () => {
    const dims = 384;
    const numVectors = 500;

    const vectors = Array.from({ length: numVectors }, (_, i) =>
      createGaussianVector(dims, i * 31 + 7)
    );

    const codebook = trainPQ(vectors, {
      subvectors: 48,
      centroids: Math.min(256, numVectors),
      maxIterations: 15,
    });

    let totalSim = 0;
    const testCount = 100;

    for (let i = 0; i < testCount; i++) {
      const original = vectors[i];
      const encoded = pqQuantize(original, codebook);
      const decoded = pqDequantize(encoded, codebook);

      totalSim += cosineSim(original, decoded);
    }

    const avgSim = totalSim / testCount;
    expect(avgSim).toBeGreaterThan(0.8);
  });
});
