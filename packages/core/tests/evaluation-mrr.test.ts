/**
 * MRR Metric Tests
 *
 * Tests for the mrr() (Mean Reciprocal Rank) evaluation metric function.
 */

import { describe, it, expect } from 'vitest';
import { mrr } from '../src/evaluation/index.js';
import { ValidationError } from '../src/errors/index.js';

describe('mrr()', () => {
  it('should return 1.0 when all first results are relevant', () => {
    const result = mrr(
      [['a', 'b'], ['c', 'd']],
      [['a'], ['c']],
    );
    expect(result).toBe(1.0);
  });

  it('should compute correct MRR for relevant items at different ranks', () => {
    const result = mrr(
      [['a', 'b', 'c'], ['d', 'e', 'f']],
      [['b'], ['f']],
    );
    // Reciprocal ranks: 1/2, 1/3
    // MRR: (1/2 + 1/3) / 2 = 5/12
    expect(result).toBeCloseTo((1 / 2 + 1 / 3) / 2);
  });

  it('should return 0.0 when no relevant items are found', () => {
    const result = mrr([['a', 'b']], [['x']]);
    expect(result).toBe(0.0);
  });

  it('should handle mixed found and not-found queries', () => {
    const result = mrr(
      [['a', 'b'], ['c', 'd']],
      [['a'], ['x']],
    );
    // Query 1: rank 1 -> RR = 1.0
    // Query 2: not found -> RR = 0.0
    // MRR: (1.0 + 0.0) / 2 = 0.5
    expect(result).toBe(0.5);
  });

  it('should handle multiple relevant items per query (first match counts)', () => {
    const result = mrr(
      [['a', 'b', 'c']],
      [['b', 'c']],
    );
    // First relevant is 'b' at rank 2 -> RR = 1/2
    expect(result).toBe(0.5);
  });

  it('should throw ValidationError on empty arrays', () => {
    expect(() => mrr([], [])).toThrow(ValidationError);
    expect(() => mrr([], [])).toThrow('at least one query');
  });

  it('should throw ValidationError on mismatched query counts', () => {
    expect(() => mrr([['a']], [['a'], ['b']])).toThrow(ValidationError);
    expect(() => mrr([['a']], [['a'], ['b']])).toThrow('equal length');
  });
});
