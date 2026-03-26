/**
 * Confusion Matrix Tests
 *
 * Tests for the confusionMatrix() evaluation function.
 */

import { describe, it, expect } from 'vitest';
import { confusionMatrix } from '../src/evaluation/index.js';
import { ValidationError } from '../src/errors/index.js';

describe('confusionMatrix()', () => {
  it('should build a binary confusion matrix', () => {
    // predictions: ['pos', 'neg', 'pos', 'pos']
    // labels:      ['pos', 'pos', 'neg', 'pos']
    const cm = confusionMatrix(
      ['pos', 'neg', 'pos', 'pos'],
      ['pos', 'pos', 'neg', 'pos'],
    );

    expect(cm.labels).toEqual(['neg', 'pos']);

    // Labels sorted: ['neg', 'pos']
    // matrix[true_idx][pred_idx]:
    // true=neg(0), pred=pos(1): 1 (index 2: label='neg', pred='pos')
    // true=pos(1), pred=pos(1): 2 (index 0,3: label='pos', pred='pos')
    // true=pos(1), pred=neg(0): 1 (index 1: label='pos', pred='neg')
    expect(cm.matrix[0][0]).toBe(0); // neg correctly predicted as neg
    expect(cm.matrix[0][1]).toBe(1); // neg incorrectly predicted as pos
    expect(cm.matrix[1][0]).toBe(1); // pos incorrectly predicted as neg
    expect(cm.matrix[1][1]).toBe(2); // pos correctly predicted as pos
  });

  it('should produce diagonal-only matrix for perfect predictions', () => {
    const cm = confusionMatrix(['a', 'b', 'c'], ['a', 'b', 'c']);

    expect(cm.labels).toEqual(['a', 'b', 'c']);

    // All predictions are correct: diagonal should be [1, 1, 1]
    expect(cm.matrix[0][0]).toBe(1);
    expect(cm.matrix[1][1]).toBe(1);
    expect(cm.matrix[2][2]).toBe(1);

    // Off-diagonal should be 0
    expect(cm.matrix[0][1]).toBe(0);
    expect(cm.matrix[0][2]).toBe(0);
    expect(cm.matrix[1][0]).toBe(0);
    expect(cm.matrix[1][2]).toBe(0);
    expect(cm.matrix[2][0]).toBe(0);
    expect(cm.matrix[2][1]).toBe(0);
  });

  it('should compute truePositives correctly', () => {
    const cm = confusionMatrix(
      ['pos', 'neg', 'pos', 'pos'],
      ['pos', 'pos', 'neg', 'pos'],
    );
    // pos: matrix[1][1] = 2
    expect(cm.truePositives('pos')).toBe(2);
    // neg: matrix[0][0] = 0
    expect(cm.truePositives('neg')).toBe(0);
  });

  it('should compute falsePositives correctly', () => {
    const cm = confusionMatrix(
      ['pos', 'neg', 'pos', 'pos'],
      ['pos', 'pos', 'neg', 'pos'],
    );
    // pos FP: column sum for 'pos' minus TP
    // column 1 (pos): matrix[0][1] + matrix[1][1] = 1 + 2 = 3, minus TP(2) = 1
    expect(cm.falsePositives('pos')).toBe(1);
    // neg FP: column sum for 'neg' minus TP
    // column 0 (neg): matrix[0][0] + matrix[1][0] = 0 + 1 = 1, minus TP(0) = 1
    expect(cm.falsePositives('neg')).toBe(1);
  });

  it('should compute trueNegatives correctly', () => {
    const cm = confusionMatrix(
      ['pos', 'neg', 'pos', 'pos'],
      ['pos', 'pos', 'neg', 'pos'],
    );
    // neg TN = total - TP(neg) - FP(neg) - FN(neg)
    // total=4, TP=0, FP=1, FN=1 => TN=2
    expect(cm.trueNegatives('neg')).toBe(2);
    // pos TN = total - TP(pos) - FP(pos) - FN(pos)
    // total=4, TP=2, FP=1, FN=1 => TN=0
    expect(cm.trueNegatives('pos')).toBe(0);
  });

  it('should compute falseNegatives correctly', () => {
    const cm = confusionMatrix(
      ['pos', 'neg', 'pos', 'pos'],
      ['pos', 'pos', 'neg', 'pos'],
    );
    // pos FN: row sum for 'pos' minus TP
    // row 1 (pos): matrix[1][0] + matrix[1][1] = 1 + 2 = 3, minus TP(2) = 1
    expect(cm.falseNegatives('pos')).toBe(1);
    // neg FN: row sum for 'neg' minus TP
    // row 0 (neg): matrix[0][0] + matrix[0][1] = 0 + 1 = 1, minus TP(0) = 1
    expect(cm.falseNegatives('neg')).toBe(1);
  });

  it('should return 0 for unknown labels in helper methods', () => {
    const cm = confusionMatrix(['a', 'b'], ['a', 'b']);
    expect(cm.truePositives('unknown')).toBe(0);
    expect(cm.falsePositives('unknown')).toBe(0);
    expect(cm.trueNegatives('unknown')).toBe(0);
    expect(cm.falseNegatives('unknown')).toBe(0);
  });

  it('should throw ValidationError on empty arrays', () => {
    expect(() => confusionMatrix([], [])).toThrow(ValidationError);
  });

  it('should throw ValidationError on mismatched lengths', () => {
    expect(() => confusionMatrix(['a'], ['a', 'b'])).toThrow(ValidationError);
  });
});
