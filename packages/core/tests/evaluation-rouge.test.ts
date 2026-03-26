/**
 * ROUGE Score Metric Tests
 *
 * Tests for the rougeScore() evaluation metric function.
 */

import { describe, it, expect } from 'vitest';
import { rougeScore } from '../src/evaluation/index.js';

describe('rougeScore()', () => {
  describe('ROUGE-1 (default)', () => {
    it('should return 1.0 for identical texts', () => {
      const result = rougeScore('the cat sat', 'the cat sat');
      expect(result).toBe(1.0);
    });

    it('should return 0.0 for no overlap', () => {
      const result = rougeScore('hello world', 'foo bar baz');
      expect(result).toBe(0.0);
    });

    it('should compute unigram F1 for partial overlap', () => {
      // candidate: "the cat" (2 tokens), reference: "the dog" (2 tokens)
      // overlap: "the" (1)
      // precision: 1/2, recall: 1/2, F1: 2 * 0.5 * 0.5 / (0.5 + 0.5) = 0.5
      const result = rougeScore('the cat', 'the dog');
      expect(result).toBeCloseTo(0.5);
    });

    it('should return 0.0 for empty candidate', () => {
      expect(rougeScore('', 'some text')).toBe(0.0);
    });

    it('should return 0.0 for empty reference', () => {
      expect(rougeScore('some text', '')).toBe(0.0);
    });
  });

  describe('ROUGE-2', () => {
    it('should return 1.0 for identical texts', () => {
      const result = rougeScore('the cat sat on', 'the cat sat on', { type: 'rouge-2' });
      expect(result).toBe(1.0);
    });

    it('should compute bigram overlap F1', () => {
      const result = rougeScore(
        'the cat sat on the mat',
        'the cat sat on a mat',
        { type: 'rouge-2' },
      );
      // candidate bigrams: "the cat", "cat sat", "sat on", "on the", "the mat" (5)
      // reference bigrams: "the cat", "cat sat", "sat on", "on a", "a mat" (5)
      // overlap: "the cat", "cat sat", "sat on" (3)
      // precision: 3/5, recall: 3/5, F1: 2 * 0.6 * 0.6 / (0.6 + 0.6) = 0.6
      expect(result).toBeCloseTo(0.6);
    });

    it('should return 0.0 when no bigrams overlap', () => {
      const result = rougeScore('hello world', 'foo bar baz', { type: 'rouge-2' });
      expect(result).toBe(0.0);
    });
  });

  describe('ROUGE-L', () => {
    it('should return 1.0 for identical texts', () => {
      const result = rougeScore('the cat sat', 'the cat sat', { type: 'rouge-l' });
      expect(result).toBe(1.0);
    });

    it('should compute LCS-based F1', () => {
      // candidate: "the cat is on the mat" (6 tokens)
      // reference: "the cat sat on the mat" (6 tokens)
      // LCS: "the cat on the mat" (5 tokens)
      // precision: 5/6, recall: 5/6
      // F1: 2 * (5/6) * (5/6) / (5/6 + 5/6) = 5/6
      const result = rougeScore(
        'the cat is on the mat',
        'the cat sat on the mat',
        { type: 'rouge-l' },
      );
      expect(result).toBeCloseTo(5 / 6);
    });

    it('should return 0.0 for no common subsequence', () => {
      const result = rougeScore('aaa bbb ccc', 'xxx yyy zzz', { type: 'rouge-l' });
      expect(result).toBe(0.0);
    });

    it('should return 0.0 for empty inputs', () => {
      expect(rougeScore('', 'some text', { type: 'rouge-l' })).toBe(0.0);
      expect(rougeScore('some text', '', { type: 'rouge-l' })).toBe(0.0);
    });
  });

  it('should default to ROUGE-1', () => {
    const defaultResult = rougeScore('the cat sat', 'the cat dog');
    const rouge1Result = rougeScore('the cat sat', 'the cat dog', { type: 'rouge-1' });
    expect(defaultResult).toBe(rouge1Result);
  });
});
