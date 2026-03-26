/**
 * Recall Metric Tests
 *
 * Tests for the recall() evaluation metric function.
 */

import { describe, it, expect } from 'vitest';
import { recall } from '../src/evaluation/index.js';
import { ValidationError } from '../src/errors/index.js';

describe('recall()', () => {
  it('should return 1.0 for perfect binary predictions', () => {
    const result = recall(['pos', 'neg'], ['pos', 'neg']);
    expect(result).toBe(1.0);
  });

  it('should handle all predictions as one class', () => {
    // predictions: ['pos', 'pos', 'pos'], labels: ['pos', 'neg', 'neg']
    // pos recall: 1/1 = 1.0 (1 TP out of 1 actual pos)
    // neg recall: 0/2 = 0.0 (0 TP out of 2 actual neg)
    // macro average: (1.0 + 0.0) / 2 = 0.5
    const result = recall(['pos', 'pos', 'pos'], ['pos', 'neg', 'neg']);
    expect(result).toBeCloseTo(0.5);
  });

  it('should return 1.0 for multi-class perfect predictions', () => {
    const result = recall(['a', 'b', 'c'], ['a', 'b', 'c']);
    expect(result).toBe(1.0);
  });

  it('should handle partial correctness', () => {
    // predictions: ['a', 'a', 'b'], labels: ['a', 'b', 'b']
    // 'a' recall: 1/1 = 1.0 (1 TP out of 1 actual a)
    // 'b' recall: 1/2 = 0.5 (1 TP out of 2 actual b)
    // macro: (1.0 + 0.5) / 2 = 0.75
    const result = recall(['a', 'a', 'b'], ['a', 'b', 'b']);
    expect(result).toBeCloseTo(0.75);
  });

  it('should throw ValidationError on empty arrays', () => {
    expect(() => recall([], [])).toThrow(ValidationError);
  });

  it('should throw ValidationError on mismatched lengths', () => {
    expect(() => recall(['a'], ['a', 'b'])).toThrow(ValidationError);
  });
});
