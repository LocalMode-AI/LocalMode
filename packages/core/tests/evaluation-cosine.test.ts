/**
 * Cosine Distance Metric Tests
 *
 * Tests for the evaluation cosineDistance() function.
 */

import { describe, it, expect } from 'vitest';
import { cosineDistance } from '../src/evaluation/index.js';
import { ValidationError } from '../src/errors/index.js';

describe('cosineDistance() [evaluation]', () => {
  it('should return 0.0 for identical vectors', () => {
    const result = cosineDistance(
      new Float32Array([1, 0, 0]),
      new Float32Array([1, 0, 0]),
    );
    expect(result).toBeCloseTo(0.0);
  });

  it('should return 2.0 for opposite vectors', () => {
    const result = cosineDistance(
      new Float32Array([1, 0]),
      new Float32Array([-1, 0]),
    );
    expect(result).toBeCloseTo(2.0);
  });

  it('should return 1.0 for orthogonal vectors', () => {
    const result = cosineDistance(
      new Float32Array([1, 0]),
      new Float32Array([0, 1]),
    );
    expect(result).toBeCloseTo(1.0);
  });

  it('should return 1.0 for zero vector (first)', () => {
    const result = cosineDistance(
      new Float32Array([0, 0, 0]),
      new Float32Array([1, 2, 3]),
    );
    expect(result).toBe(1.0);
  });

  it('should return 1.0 for zero vector (second)', () => {
    const result = cosineDistance(
      new Float32Array([1, 2, 3]),
      new Float32Array([0, 0, 0]),
    );
    expect(result).toBe(1.0);
  });

  it('should return 1.0 for both zero vectors', () => {
    const result = cosineDistance(
      new Float32Array([0, 0]),
      new Float32Array([0, 0]),
    );
    expect(result).toBe(1.0);
  });

  it('should return near 0 for similar vectors', () => {
    const result = cosineDistance(
      new Float32Array([1, 2, 3]),
      new Float32Array([1, 2, 3.01]),
    );
    expect(result).toBeCloseTo(0.0, 3);
  });

  it('should throw ValidationError on dimension mismatch', () => {
    expect(() =>
      cosineDistance(
        new Float32Array([1, 0]),
        new Float32Array([1, 0, 0]),
      ),
    ).toThrow(ValidationError);
    expect(() =>
      cosineDistance(
        new Float32Array([1, 0]),
        new Float32Array([1, 0, 0]),
      ),
    ).toThrow('equal dimensions');
  });
});
