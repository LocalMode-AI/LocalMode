/**
 * Precision Metric Tests
 *
 * Tests for the precision() evaluation metric function.
 */

import { describe, it, expect } from 'vitest';
import { precision } from '../src/evaluation/index.js';
import { ValidationError } from '../src/errors/index.js';

describe('precision()', () => {
  it('should return 1.0 for perfect binary predictions', () => {
    const result = precision(['pos', 'neg'], ['pos', 'neg']);
    expect(result).toBe(1.0);
  });

  it('should handle all predictions as one class', () => {
    // predictions: ['pos', 'pos', 'pos'], labels: ['pos', 'neg', 'neg']
    // pos precision: 1/3 (1 TP out of 3 predictions)
    // neg precision: 0 (no neg predictions)
    // macro average: (1/3 + 0) / 2
    const result = precision(['pos', 'pos', 'pos'], ['pos', 'neg', 'neg']);
    expect(result).toBeCloseTo((1 / 3 + 0) / 2);
  });

  it('should return 1.0 for multi-class perfect predictions', () => {
    const result = precision(['a', 'b', 'c'], ['a', 'b', 'c']);
    expect(result).toBe(1.0);
  });

  it('should handle partial correctness', () => {
    // predictions: ['a', 'a', 'b'], labels: ['a', 'b', 'b']
    // 'a' precision: 1/2 (1 TP, 1 FP)
    // 'b' precision: 1/1 (1 TP, 0 FP)
    // macro: (0.5 + 1.0) / 2 = 0.75
    const result = precision(['a', 'a', 'b'], ['a', 'b', 'b']);
    expect(result).toBeCloseTo(0.75);
  });

  it('should throw ValidationError on empty arrays', () => {
    expect(() => precision([], [])).toThrow(ValidationError);
  });

  it('should throw ValidationError on mismatched lengths', () => {
    expect(() => precision(['a'], ['a', 'b'])).toThrow(ValidationError);
  });
});
