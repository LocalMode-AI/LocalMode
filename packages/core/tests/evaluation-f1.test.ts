/**
 * F1 Score Metric Tests
 *
 * Tests for the f1Score() evaluation metric function.
 */

import { describe, it, expect } from 'vitest';
import { f1Score, accuracy } from '../src/evaluation/index.js';
import { ValidationError } from '../src/errors/index.js';

describe('f1Score()', () => {
  it('should return 1.0 for perfect predictions (macro)', () => {
    const result = f1Score(['cat', 'dog'], ['cat', 'dog']);
    expect(result).toBe(1.0);
  });

  it('should return 0.0 when no predictions are correct (macro)', () => {
    const result = f1Score(['a', 'a'], ['b', 'b']);
    expect(result).toBe(0.0);
  });

  it('should compute macro F1 with imbalanced predictions', () => {
    // predictions: ['a', 'a', 'a', 'b'], labels: ['a', 'b', 'b', 'b']
    // class 'a': TP=1, FP=2, FN=0, P=1/3, R=1/1, F1=2*(1/3*1)/(1/3+1)=2/3*3/4=1/2
    // class 'b': TP=1, FP=0, FN=2, P=1/1, R=1/3, F1=2*(1*1/3)/(1+1/3)=2/3*3/4=1/2
    // macro F1 = (0.5 + 0.5) / 2 = 0.5
    const result = f1Score(['a', 'a', 'a', 'b'], ['a', 'b', 'b', 'b']);
    expect(result).toBeCloseTo(0.5);
  });

  it('should compute micro F1 equal to accuracy', () => {
    const predictions = ['a', 'b', 'a', 'b', 'c'];
    const labels = ['a', 'a', 'b', 'b', 'c'];

    const microF1 = f1Score(predictions, labels, { average: 'micro' });
    const acc = accuracy(predictions, labels);

    // Micro F1 equals accuracy for single-label multi-class classification
    expect(microF1).toBeCloseTo(acc);
  });

  it('should compute weighted F1 accounting for class support', () => {
    // predictions: ['a', 'a', 'b'], labels: ['a', 'b', 'b']
    // class 'a': TP=1, FP=1, FN=0, P=0.5, R=1.0, F1=2/3, support=1
    // class 'b': TP=1, FP=0, FN=1, P=1.0, R=0.5, F1=2/3, support=2
    // weighted F1 = (2/3 * 1 + 2/3 * 2) / 3 = 2/3
    const result = f1Score(['a', 'a', 'b'], ['a', 'b', 'b'], { average: 'weighted' });
    expect(result).toBeCloseTo(2 / 3);
  });

  it('should default to macro averaging', () => {
    const macro = f1Score(['a', 'b'], ['a', 'b']);
    const explicitMacro = f1Score(['a', 'b'], ['a', 'b'], { average: 'macro' });
    expect(macro).toBe(explicitMacro);
  });

  it('should throw ValidationError on empty arrays', () => {
    expect(() => f1Score([], [])).toThrow(ValidationError);
  });

  it('should throw ValidationError on mismatched lengths', () => {
    expect(() => f1Score(['a'], ['a', 'b'])).toThrow(ValidationError);
  });
});
