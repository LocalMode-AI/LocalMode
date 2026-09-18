/**
 * Deterministic single-thread JS matmul microbenchmark. Every submission runs
 * it; the resulting MFLOPS is a hardware fingerprint that claimed inference
 * rates must plausibly correlate with, and the checksum proves the work ran.
 */

import type { FingerprintResult } from './types.js';
import { hrNow } from './timing.js';

/** Deterministic LCG so every device multiplies the same matrices. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/**
 * Run the fingerprint microbenchmark: repeated n x n f32 matmuls for at least
 * `minDurationMs`, single-threaded, deterministic inputs.
 *
 * @param options.n - Matrix dimension (default 160; ~8.2 MFLOP per iteration).
 * @param options.minDurationMs - Minimum wall time to run (default 600).
 * @returns MFLOPS, iteration count, and a checksum of the final product.
 * @example
 * const fp = await runFingerprint(); // { mflops: 1800.4, ... }
 */
export async function runFingerprint(options?: {
  n?: number;
  minDurationMs?: number;
}): Promise<FingerprintResult> {
  const n = options?.n ?? 160;
  const minDurationMs = options?.minDurationMs ?? 600;
  const rand = lcg(0xbe7c4);
  const a = new Float32Array(n * n);
  const b = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    a[i] = rand() - 0.5;
    b[i] = rand() - 0.5;
  }
  const c = new Float32Array(n * n);
  const flopsPerIter = 2 * n * n * n;
  let iterations = 0;
  const start = hrNow();
  let elapsed = 0;
  while (elapsed < minDurationMs) {
    matmul(a, b, c, n);
    iterations++;
    elapsed = hrNow() - start;
    // Yield to the event loop every few iterations so validity-gate listeners
    // (visibilitychange, abort) can run during the fingerprint.
    if (iterations % 4 === 0) await Promise.resolve();
  }
  let checksum = 0;
  for (let i = 0; i < n * n; i += 97) checksum += c[i];
  return {
    mflops: (flopsPerIter * iterations) / (elapsed * 1000),
    n,
    iterations,
    durationMs: elapsed,
    checksum: Math.fround(checksum),
  };
}

/** Naive row-major matmul (deliberately unoptimized and stable across engines). */
function matmul(a: Float32Array, b: Float32Array, c: Float32Array, n: number): void {
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let acc = 0;
      for (let k = 0; k < n; k++) acc += a[i * n + k] * b[k * n + j];
      c[i * n + j] = acc;
    }
  }
}
