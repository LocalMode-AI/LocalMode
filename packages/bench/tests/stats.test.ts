import { describe, expect, it } from 'vitest';
import { geomean, mean, median, quantile, spearman, stddev, summarize } from '../src/stats.js';

describe('quantile()', () => {
  it('interpolates type-7 quantiles', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75);
    expect(quantile([5], 0.9)).toBe(5);
  });

  it('rejects empty samples and out-of-range q', () => {
    expect(() => quantile([], 0.5)).toThrow(RangeError);
    expect(() => quantile([1], 1.5)).toThrow(RangeError);
  });
});

describe('median()/mean()/stddev()', () => {
  it('computes exact values', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(mean([2, 4, 9])).toBe(5);
    // Sample SD of [2,4,4,4,5,5,7,9] = 2.138...
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.1381, 3);
    expect(stddev([7])).toBe(0);
  });
});

describe('geomean()', () => {
  it('computes the geometric mean', () => {
    expect(geomean([1, 100])).toBeCloseTo(10, 10);
    expect(geomean([2, 8])).toBeCloseTo(4, 10);
  });

  it('rejects non-positive values', () => {
    expect(() => geomean([1, 0])).toThrow(RangeError);
    expect(() => geomean([])).toThrow(RangeError);
  });
});

describe('summarize()', () => {
  it('reports median/mean/sd/iqr/min/max/cv', () => {
    const s = summarize([100, 110, 120]);
    expect(s.n).toBe(3);
    expect(s.median).toBe(110);
    expect(s.mean).toBe(110);
    expect(s.sd).toBeCloseTo(10, 10);
    expect(s.min).toBe(100);
    expect(s.max).toBe(120);
    expect(s.cv).toBeCloseTo(10 / 110, 10);
    // n=3 → df=2 → t(df=2, 95%) = 4.303 → CI = 4.303 * 10 / sqrt(3)
    expect(s.ci95).toBeCloseTo((4.303 * 10) / Math.sqrt(3), 3);
  });

  it('handles n=1 with zero dispersion', () => {
    const s = summarize([42]);
    expect(s.median).toBe(42);
    expect(s.sd).toBe(0);
    expect(s.ci95).toBe(0);
  });
});

describe('spearman()', () => {
  it('is 1 for a monotonic relation and -1 for a reversed one', () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 10);
    expect(spearman([1, 2, 3, 4], [9, 7, 5, 1])).toBeCloseTo(-1, 10);
  });

  it('handles ties with average ranks', () => {
    // Hand-computed: ranks a = [1.5, 1.5, 3], ranks b = [1, 2, 3] → rho ≈ 0.866
    expect(spearman([5, 5, 9], [1, 2, 3])).toBeCloseTo(0.866, 2);
  });

  it('rejects mismatched or tiny samples', () => {
    expect(() => spearman([1], [1])).toThrow(RangeError);
    expect(() => spearman([1, 2], [1])).toThrow(RangeError);
  });
});
