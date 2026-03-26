/**
 * NDCG Metric Tests
 *
 * Tests for the ndcg() (Normalized Discounted Cumulative Gain) metric function.
 */

import { describe, it, expect } from 'vitest';
import { ndcg } from '../src/evaluation/index.js';

describe('ndcg()', () => {
  it('should return 1.0 for perfect ranking', () => {
    const result = ndcg(['a', 'b', 'c'], { a: 3, b: 2, c: 1 });
    expect(result).toBeCloseTo(1.0);
  });

  it('should return less than 1.0 for reversed ranking', () => {
    const result = ndcg(['c', 'b', 'a'], { a: 3, b: 2, c: 1 });
    expect(result).toBeLessThan(1.0);
    expect(result).toBeGreaterThan(0);
  });

  it('should limit evaluation depth to k', () => {
    // Only consider first 2 results
    const result = ndcg(['a', 'b', 'c', 'd'], { a: 3, b: 2, c: 1, d: 0 }, 2);

    // DCG@2 = 3/log2(2) + 2/log2(3)
    // IDCG@2 = 3/log2(2) + 2/log2(3) (same — perfect ranking at top 2)
    expect(result).toBeCloseTo(1.0);
  });

  it('should return 0.0 when no relevant items are in results', () => {
    const result = ndcg(['x', 'y'], { a: 3, b: 2 });
    expect(result).toBe(0.0);
  });

  it('should return 0.0 for empty results', () => {
    const result = ndcg([], { a: 1 });
    expect(result).toBe(0.0);
  });

  it('should treat items not in relevanceScores as relevance 0', () => {
    const result = ndcg(['x', 'a'], { a: 3 });
    // DCG = 0/log2(2) + 3/log2(3)
    // IDCG = 3/log2(2) (only 1 relevant item, at position 1)
    const dcg = 3 / Math.log2(3);
    const idcg = 3 / Math.log2(2);
    expect(result).toBeCloseTo(dcg / idcg);
  });

  it('should handle single item', () => {
    const result = ndcg(['a'], { a: 5 });
    expect(result).toBeCloseTo(1.0);
  });

  it('should default k to rankedResults.length', () => {
    const withK = ndcg(['a', 'b'], { a: 3, b: 2 }, 2);
    const withoutK = ndcg(['a', 'b'], { a: 3, b: 2 });
    expect(withK).toBe(withoutK);
  });
});
