import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  cosineDistance,
  euclideanDistance,
  dotProduct,
  normalize,
} from '../src/hnsw/distance.js';

describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    const v = new Float32Array([1, 2, 3, 4]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it('should return 0 for orthogonal vectors', () => {
    const v1 = new Float32Array([1, 0, 0, 0]);
    const v2 = new Float32Array([0, 1, 0, 0]);
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(0, 5);
  });

  it('should return -1 for opposite vectors', () => {
    const v1 = new Float32Array([1, 0, 0, 0]);
    const v2 = new Float32Array([-1, 0, 0, 0]);
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(-1, 5);
  });

  it('should throw for mismatched dimensions', () => {
    const v1 = new Float32Array([1, 2, 3]);
    const v2 = new Float32Array([1, 2, 3, 4]);
    expect(() => cosineSimilarity(v1, v2)).toThrow(/mismatch/i);
  });

  it('should return 0 for zero vectors', () => {
    const v1 = new Float32Array([0, 0, 0, 0]);
    const v2 = new Float32Array([1, 2, 3, 4]);
    expect(cosineSimilarity(v1, v2)).toBe(0);
  });
});

describe('cosineDistance', () => {
  it('should return 0 for identical vectors', () => {
    const v = new Float32Array([1, 2, 3, 4]);
    expect(cosineDistance(v, v)).toBeCloseTo(0, 5);
  });

  it('should return 1 for orthogonal vectors', () => {
    const v1 = new Float32Array([1, 0, 0, 0]);
    const v2 = new Float32Array([0, 1, 0, 0]);
    expect(cosineDistance(v1, v2)).toBeCloseTo(1, 5);
  });

  it('should return 2 for opposite vectors', () => {
    const v1 = new Float32Array([1, 0, 0, 0]);
    const v2 = new Float32Array([-1, 0, 0, 0]);
    expect(cosineDistance(v1, v2)).toBeCloseTo(2, 5);
  });
});

describe('euclideanDistance', () => {
  it('should return 0 for identical vectors', () => {
    const v = new Float32Array([1, 2, 3, 4]);
    expect(euclideanDistance(v, v)).toBe(0);
  });

  it('should compute correct distance', () => {
    const v1 = new Float32Array([0, 0]);
    const v2 = new Float32Array([3, 4]);
    expect(euclideanDistance(v1, v2)).toBeCloseTo(5, 5); // 3-4-5 triangle
  });

  it('should throw for mismatched dimensions', () => {
    const v1 = new Float32Array([1, 2]);
    const v2 = new Float32Array([1, 2, 3]);
    expect(() => euclideanDistance(v1, v2)).toThrow(/mismatch/i);
  });
});

describe('dotProduct', () => {
  it('should compute correct dot product', () => {
    const v1 = new Float32Array([1, 2, 3]);
    const v2 = new Float32Array([4, 5, 6]);
    expect(dotProduct(v1, v2)).toBe(1 * 4 + 2 * 5 + 3 * 6); // 32
  });

  it('should return 0 for orthogonal vectors', () => {
    const v1 = new Float32Array([1, 0, 0]);
    const v2 = new Float32Array([0, 1, 0]);
    expect(dotProduct(v1, v2)).toBe(0);
  });

  it('should throw for mismatched dimensions', () => {
    const v1 = new Float32Array([1, 2]);
    const v2 = new Float32Array([1, 2, 3]);
    expect(() => dotProduct(v1, v2)).toThrow(/mismatch/i);
  });
});

describe('normalize', () => {
  it('should normalize a vector to unit length', () => {
    const v = new Float32Array([3, 4]);
    const normalized = normalize(v);
    
    // Magnitude should be 1
    const magnitude = Math.sqrt(normalized[0] ** 2 + normalized[1] ** 2);
    expect(magnitude).toBeCloseTo(1, 5);
    
    // Direction should be preserved
    expect(normalized[0]).toBeCloseTo(0.6, 5); // 3/5
    expect(normalized[1]).toBeCloseTo(0.8, 5); // 4/5
  });

  it('should handle zero vectors', () => {
    const v = new Float32Array([0, 0, 0]);
    const normalized = normalize(v);
    expect(normalized[0]).toBe(0);
    expect(normalized[1]).toBe(0);
    expect(normalized[2]).toBe(0);
  });

  it('should not modify the original vector', () => {
    const v = new Float32Array([3, 4]);
    normalize(v);
    expect(v[0]).toBe(3);
    expect(v[1]).toBe(4);
  });
});

