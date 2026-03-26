/**
 * Accuracy Metric Tests
 *
 * Tests for the accuracy() evaluation metric function.
 */

import { describe, it, expect } from 'vitest';
import { accuracy } from '../src/evaluation/index.js';
import { ValidationError } from '../src/errors/index.js';

describe('accuracy()', () => {
  it('should return 1.0 for perfect predictions', () => {
    const result = accuracy(['cat', 'dog', 'bird'], ['cat', 'dog', 'bird']);
    expect(result).toBe(1.0);
  });

  it('should return 0.0 for no correct predictions', () => {
    const result = accuracy(['cat', 'cat', 'cat'], ['dog', 'bird', 'fish']);
    expect(result).toBe(0.0);
  });

  it('should return 0.5 for partial correctness', () => {
    const result = accuracy(
      ['cat', 'dog', 'bird', 'fish'],
      ['cat', 'dog', 'fish', 'bird'],
    );
    expect(result).toBe(0.5);
  });

  it('should handle single-element arrays', () => {
    expect(accuracy(['a'], ['a'])).toBe(1.0);
    expect(accuracy(['a'], ['b'])).toBe(0.0);
  });

  it('should throw ValidationError on empty arrays', () => {
    expect(() => accuracy([], [])).toThrow(ValidationError);
    expect(() => accuracy([], [])).toThrow('at least one prediction');
  });

  it('should throw ValidationError on mismatched array lengths', () => {
    expect(() => accuracy(['a', 'b'], ['a'])).toThrow(ValidationError);
    expect(() => accuracy(['a', 'b'], ['a'])).toThrow('equal length');
  });

  it('should include hint in ValidationError', () => {
    try {
      accuracy([], []);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).hint).toBeDefined();
    }
  });
});
