/**
 * BLEU Score Metric Tests
 *
 * Tests for the bleuScore() evaluation metric function.
 */

import { describe, it, expect } from 'vitest';
import { bleuScore } from '../src/evaluation/index.js';
import { ValidationError } from '../src/errors/index.js';

describe('bleuScore()', () => {
  it('should return 1.0 for identical candidate and reference', () => {
    const result = bleuScore('the cat sat on the mat', ['the cat sat on the mat']);
    expect(result).toBe(1.0);
  });

  it('should return 0.0 for completely different texts', () => {
    const result = bleuScore('hello world', ['the cat sat on the mat']);
    expect(result).toBe(0.0);
  });

  it('should return 0.0 for empty candidate', () => {
    const result = bleuScore('', ['some reference text']);
    expect(result).toBe(0.0);
  });

  it('should handle multiple references', () => {
    const candidate = 'the cat sat on the mat';
    const refs = [
      'the cat sat on the mat',
      'a cat is sitting on a mat',
    ];
    const result = bleuScore(candidate, refs);
    // Should be 1.0 since the first reference is identical
    expect(result).toBe(1.0);
  });

  it('should apply brevity penalty for short candidates', () => {
    // Short candidate vs longer reference
    const short = bleuScore('the cat', ['the cat sat on the mat']);
    // Perfect match but shorter, should have brevity penalty applied
    // Since there's no 4-gram overlap for a 2-word candidate, result should be 0
    expect(short).toBe(0.0);
  });

  it('should return a value between 0 and 1 for partial overlap', () => {
    const result = bleuScore(
      'the cat sat on a mat in the room',
      ['the cat sat on the mat'],
    );
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('should return a higher score for closer matches', () => {
    const close = bleuScore(
      'the cat sat on the mat today',
      ['the cat sat on the mat'],
    );
    const far = bleuScore(
      'a dog ran in the park today',
      ['the cat sat on the mat'],
    );
    expect(close).toBeGreaterThan(far);
  });

  it('should throw ValidationError on empty references', () => {
    expect(() => bleuScore('some text', [])).toThrow(ValidationError);
    expect(() => bleuScore('some text', [])).toThrow('at least one reference');
  });
});
