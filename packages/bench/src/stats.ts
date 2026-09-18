/**
 * Statistics for benchmark reporting: median headline, mean ± SD, IQR, 95% CI
 * (Student-t for the small n this protocol uses), CV, and geometric mean for
 * cross-workload aggregation (never across devices).
 */

import type { MetricSummary } from './types.js';

/** Two-sided 95% Student-t critical values by degrees of freedom (1..30). */
const T_95: number[] = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16,
  2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052,
  2.048, 2.045, 2.042,
];

/** Sorted copy helper. */
function sorted(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/**
 * Linear-interpolated quantile (type-7, the R/NumPy default).
 *
 * @param values - Sample values (need not be sorted).
 * @param q - Quantile in [0, 1].
 * @returns The interpolated quantile.
 * @throws {RangeError} When `values` is empty or `q` is out of range.
 * @example
 * quantile([1, 2, 3, 4], 0.5); // 2.5
 */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) throw new RangeError('quantile() requires a non-empty sample');
  if (q < 0 || q > 1) throw new RangeError(`quantile q must be in [0,1], got ${q}`);
  const s = sorted(values);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** Median of a sample. @see quantile */
export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

/** Arithmetic mean. @throws {RangeError} on an empty sample. */
export function mean(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError('mean() requires a non-empty sample');
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Sample standard deviation (n-1 denominator). Returns 0 for n < 2. */
export function stddev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let acc = 0;
  for (const v of values) acc += (v - m) * (v - m);
  return Math.sqrt(acc / (values.length - 1));
}

/**
 * Geometric mean. Used to aggregate across workloads within one device run
 * (Speedometer/JetStream convention). All values must be positive.
 *
 * @throws {RangeError} on an empty sample or non-positive values.
 */
export function geomean(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError('geomean() requires a non-empty sample');
  let acc = 0;
  for (const v of values) {
    if (v <= 0) throw new RangeError(`geomean() requires positive values, got ${v}`);
    acc += Math.log(v);
  }
  return Math.exp(acc / values.length);
}

/**
 * Full summary of one metric across timed iterations.
 *
 * @param values - One value per timed iteration (ms, tok/s, ...).
 * @returns Median headline plus dispersion measures; `ci95` is the Student-t
 *   95% half-width (0 when n < 2).
 * @example
 * summarize([102, 99, 104]).median; // 102
 */
export function summarize(values: readonly number[]): MetricSummary {
  if (values.length === 0) throw new RangeError('summarize() requires a non-empty sample');
  const n = values.length;
  const m = mean(values);
  const sd = stddev(values);
  const s = sorted(values);
  const ci95 = n >= 2 ? (T_95[Math.min(n - 2, T_95.length - 1)] * sd) / Math.sqrt(n) : 0;
  return {
    n,
    median: median(values),
    mean: m,
    sd,
    iqr: quantile(values, 0.75) - quantile(values, 0.25),
    min: s[0],
    max: s[n - 1],
    ci95,
    cv: m === 0 ? 0 : sd / Math.abs(m),
  };
}

/**
 * Spearman rank correlation between two equal-length samples, with average
 * ranks for ties. Used by the STS embedding-quality lane.
 *
 * @returns rho in [-1, 1].
 * @throws {RangeError} when lengths differ or n < 2.
 */
export function spearman(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new RangeError('spearman() requires equal-length samples');
  if (a.length < 2) throw new RangeError('spearman() requires n >= 2');
  const ra = ranks(a);
  const rb = ranks(b);
  return pearson(ra, rb);
}

/** Average ranks (1-based) with tie handling. */
function ranks(values: readonly number[]): number[] {
  const idx = values.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0]);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[idx[k][1]] = avgRank;
    i = j + 1;
  }
  return out;
}

/** Pearson correlation. Returns 0 when either sample has zero variance. */
function pearson(a: readonly number[], b: readonly number[]): number {
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : num / den;
}
