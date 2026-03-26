/**
 * @fileoverview Tests for storage compression (SQ8 and delta-SQ8).
 *
 * Tests compressVectors/decompressVectors roundtrip accuracy,
 * auto-calibration, pre-computed calibration, delta encoding,
 * empty input handling, output size, and cosine similarity preservation.
 */

import { describe, it, expect } from 'vitest';
import {
  compressVectors,
  decompressVectors,
  calibrate,
} from '../src/index.js';
import type {
  CompressedVectorBlock,
  ScalarCalibrationData,
} from '../src/index.js';

// ============================================================================
// Helper utilities
// ============================================================================

/** Create a deterministic pseudo-random vector */
function createTestVector(dimensions: number, seed: number): Float32Array {
  const vec = new Float32Array(dimensions);
  let s = seed;
  for (let i = 0; i < dimensions; i++) {
    // Simple LCG for deterministic randomness
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    vec[i] = (s / 0x7fffffff) * 2 - 1; // Range [-1, 1]
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
// compressVectors() unit tests
// ============================================================================

describe('compressVectors()', () => {
  it('compresses a single vector with auto-calibration', () => {
    const vector = new Float32Array([0.1, -0.5, 0.3, 0.8]);
    const block = compressVectors([vector]);

    expect(block.data).toHaveLength(1);
    expect(block.data[0]).toBeInstanceOf(Uint8Array);
    expect(block.data[0].length).toBe(4);
    expect(block.count).toBe(1);
    expect(block.mode).toBe('sq8');
    expect(block.calibration.min).toBeInstanceOf(Float32Array);
    expect(block.calibration.max).toBeInstanceOf(Float32Array);
  });

  it('compresses a batch of vectors with auto-calibration', () => {
    const vectors = [
      new Float32Array([0.1, -0.5, 0.3, 0.8]),
      new Float32Array([0.4, 0.2, -0.1, 0.6]),
      new Float32Array([0.2, 0.0, 0.5, 0.9]),
    ];

    const block = compressVectors(vectors);

    expect(block.data).toHaveLength(3);
    expect(block.count).toBe(3);
    expect(block.mode).toBe('sq8');
    for (const d of block.data) {
      expect(d).toBeInstanceOf(Uint8Array);
      expect(d.length).toBe(4);
    }

    // Calibration should reflect min/max from input vectors
    expect(block.calibration.min[0]).toBeCloseTo(0.1, 5);
    expect(block.calibration.max[0]).toBeCloseTo(0.4, 5);
    expect(block.calibration.min[1]).toBeCloseTo(-0.5, 5);
    expect(block.calibration.max[1]).toBeCloseTo(0.2, 5);
  });

  it('uses pre-computed calibration when provided', () => {
    const vectors = [
      new Float32Array([0.1, -0.5, 0.3]),
      new Float32Array([0.4, 0.2, -0.1]),
    ];

    // Pre-compute calibration with a wider range
    const preCalibration: ScalarCalibrationData = {
      min: new Float32Array([-1.0, -1.0, -1.0]),
      max: new Float32Array([1.0, 1.0, 1.0]),
    };

    const block = compressVectors(vectors, preCalibration);

    // Should use the provided calibration, not recompute
    expect(block.calibration.min[0]).toBeCloseTo(-1.0, 5);
    expect(block.calibration.max[0]).toBeCloseTo(1.0, 5);
  });

  it('throws error on empty vectors array', () => {
    expect(() => compressVectors([])).toThrow('at least one vector is required');
  });

  it('produces output that is 4x smaller than input', () => {
    const dimensions = 384;
    const numVectors = 100;
    const vectors: Float32Array[] = [];
    for (let i = 0; i < numVectors; i++) {
      vectors.push(createTestVector(dimensions, i));
    }

    const block = compressVectors(vectors);

    // Original size: 100 * 384 * 4 = 153,600 bytes
    const originalSize = numVectors * dimensions * 4;
    // Compressed size: 100 * 384 = 38,400 bytes
    let compressedSize = 0;
    for (const d of block.data) {
      compressedSize += d.length;
    }

    expect(compressedSize).toBe(numVectors * dimensions);
    expect(originalSize / compressedSize).toBe(4);
  });
});

// ============================================================================
// decompressVectors() unit tests
// ============================================================================

describe('decompressVectors()', () => {
  it('roundtrip compress-decompress preserves approximate values', () => {
    const vectors = [
      new Float32Array([0.1, -0.5, 0.3, 0.8]),
      new Float32Array([0.4, 0.2, -0.1, 0.6]),
    ];

    const block = compressVectors(vectors);
    const restored = decompressVectors(block, block.calibration);

    expect(restored).toHaveLength(2);

    for (let v = 0; v < vectors.length; v++) {
      expect(restored[v]).toBeInstanceOf(Float32Array);
      expect(restored[v].length).toBe(4);

      for (let d = 0; d < 4; d++) {
        const range = block.calibration.max[d] - block.calibration.min[d];
        const maxError = range / 255;
        expect(Math.abs(restored[v][d] - vectors[v][d])).toBeLessThanOrEqual(maxError + 1e-6);
      }
    }
  });

  it('decompresses empty block to empty array', () => {
    const block: CompressedVectorBlock = {
      data: [],
      calibration: {
        min: new Float32Array([0]),
        max: new Float32Array([1]),
      },
      mode: 'sq8',
      count: 0,
    };

    const result = decompressVectors(block, block.calibration);
    expect(result).toHaveLength(0);
  });

  it('roundtrip with 384-dim vectors preserves accuracy', () => {
    const vectors: Float32Array[] = [];
    for (let i = 0; i < 10; i++) {
      vectors.push(createTestVector(384, i + 42));
    }

    const block = compressVectors(vectors);
    const restored = decompressVectors(block, block.calibration);

    expect(restored).toHaveLength(10);
    for (let v = 0; v < vectors.length; v++) {
      expect(restored[v].length).toBe(384);
      for (let d = 0; d < 384; d++) {
        const range = block.calibration.max[d] - block.calibration.min[d];
        const maxError = range / 255;
        expect(Math.abs(restored[v][d] - vectors[v][d])).toBeLessThanOrEqual(maxError + 1e-6);
      }
    }
  });
});

// ============================================================================
// Delta-SQ8 mode tests
// ============================================================================

describe('compressVectors() with delta-sq8 mode', () => {
  it('produces deltaCalibration for multi-vector batches', () => {
    // Create vectors that span a wide range but where consecutive vectors are close.
    // This simulates sorted embeddings (e.g., from the same topic cluster).
    // Each vector[d] = i * step + small_noise, so the full range is ~10*step
    // but consecutive deltas are ~step (much smaller).
    const dims = 8;
    const n = 20;
    const step = 0.08;
    const vectors: Float32Array[] = [];
    for (let i = 0; i < n; i++) {
      const vec = new Float32Array(dims);
      let s = i * 31 + 7;
      for (let d = 0; d < dims; d++) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        const noise = ((s / 0x7fffffff) - 0.5) * 0.005;
        vec[d] = -0.8 + i * step + noise;
      }
      vectors.push(vec);
    }

    const block = compressVectors(vectors, undefined, 'delta-sq8');

    expect(block.mode).toBe('delta-sq8');
    expect(block.deltaCalibration).toBeDefined();
    expect(block.count).toBe(n);

    // Delta calibration should have a narrower range than primary calibration
    // because consecutive deltas (~step) are much smaller than the full range (~n*step)
    if (block.deltaCalibration) {
      let primaryRange = 0;
      let deltaRange = 0;
      for (let d = 0; d < dims; d++) {
        primaryRange += block.calibration.max[d] - block.calibration.min[d];
        deltaRange += block.deltaCalibration.max[d] - block.deltaCalibration.min[d];
      }
      expect(deltaRange).toBeLessThan(primaryRange);
    }
  });

  it('single vector in delta-sq8 mode falls back to standard SQ8', () => {
    const vector = new Float32Array([0.1, -0.5, 0.3, 0.8]);
    const block = compressVectors([vector], undefined, 'delta-sq8');

    expect(block.mode).toBe('delta-sq8');
    expect(block.deltaCalibration).toBeUndefined();
    expect(block.count).toBe(1);
    expect(block.data).toHaveLength(1);
  });

  it('roundtrip compress-decompress works in delta-sq8 mode', () => {
    const vectors = [
      new Float32Array([0.1, -0.5, 0.3, 0.8]),
      new Float32Array([0.15, -0.48, 0.28, 0.82]),
      new Float32Array([0.12, -0.45, 0.32, 0.78]),
    ];

    const block = compressVectors(vectors, undefined, 'delta-sq8');
    const restored = decompressVectors(block, block.calibration);

    expect(restored).toHaveLength(3);
    for (let v = 0; v < vectors.length; v++) {
      expect(restored[v]).toBeInstanceOf(Float32Array);
      expect(restored[v].length).toBe(4);
      // Delta-sq8 has slightly more error than plain sq8 due to error accumulation,
      // but should still be reasonably close
      for (let d = 0; d < 4; d++) {
        expect(Math.abs(restored[v][d] - vectors[v][d])).toBeLessThan(0.1);
      }
    }
  });
});

// ============================================================================
// Cosine similarity preservation test
// ============================================================================

describe('cosine similarity preservation', () => {
  it('compress-decompress preserves cosine similarity within 0.01', () => {
    // Create pairs of 384-dim vectors with known cosine similarity
    const vectors: Float32Array[] = [];
    for (let i = 0; i < 20; i++) {
      vectors.push(createTestVector(384, i * 7 + 1));
    }

    // Compute original cosine similarities for pairs
    const originalSims: number[] = [];
    for (let i = 0; i < vectors.length - 1; i++) {
      originalSims.push(cosineSim(vectors[i], vectors[i + 1]));
    }

    // Compress and decompress
    const block = compressVectors(vectors);
    const restored = decompressVectors(block, block.calibration);

    // Compute decompressed cosine similarities
    for (let i = 0; i < restored.length - 1; i++) {
      const restoredSim = cosineSim(restored[i], restored[i + 1]);
      const delta = Math.abs(restoredSim - originalSims[i]);
      expect(delta).toBeLessThan(0.01);
    }
  });
});
