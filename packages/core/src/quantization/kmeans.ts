/**
 * @file kmeans.ts
 * @description Pure TypeScript k-means clustering using Lloyd's algorithm.
 *
 * Used internally by product quantization (PQ) to cluster subvector spaces.
 * No external dependencies -- all math is plain TypeScript.
 */

import { ValidationError } from '../errors/index.js';

/**
 * Options for k-means clustering.
 */
export interface KMeansOptions {
  /** Maximum number of iterations. Default: 20. */
  maxIterations?: number;

  /**
   * Convergence threshold. Clustering stops when the maximum centroid
   * movement between iterations is less than this value.
   * Default: 1e-6.
   */
  threshold?: number;

  /** AbortSignal to cancel the operation. */
  abortSignal?: AbortSignal;
}

/**
 * Result of k-means clustering.
 */
export interface KMeansResult {
  /** Cluster centroids -- one Float32Array per cluster. */
  centroids: Float32Array[];

  /** Cluster assignment for each input data point (index into centroids). */
  assignments: Uint32Array;

  /** Number of iterations the algorithm ran. */
  iterations: number;
}

/**
 * Assign each data point to the nearest centroid using squared Euclidean distance.
 * Ties are broken by choosing the lower-indexed centroid (deterministic).
 *
 * @param data - Array of data point vectors.
 * @param centroids - Current centroid vectors.
 * @returns Uint32Array of cluster indices, one per data point.
 */
function assignToClusters(data: Float32Array[], centroids: Float32Array[]): Uint32Array {
  const n = data.length;
  const k = centroids.length;
  const dim = data[0].length;
  const assignments = new Uint32Array(n);

  for (let i = 0; i < n; i++) {
    const point = data[i];
    let bestDist = Infinity;
    let bestIdx = 0;

    for (let c = 0; c < k; c++) {
      const centroid = centroids[c];
      let dist = 0;
      for (let d = 0; d < dim; d++) {
        const diff = point[d] - centroid[d];
        dist += diff * diff;
      }

      // Strict less-than ensures lower-indexed centroid wins ties
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = c;
      }
    }

    assignments[i] = bestIdx;
  }

  return assignments;
}

/**
 * Compute new centroids as the mean of assigned data points.
 * Empty clusters are re-initialized from a random data point.
 *
 * @param data - Array of data point vectors.
 * @param assignments - Current cluster assignments.
 * @param k - Number of clusters.
 * @param dim - Dimensionality of each data point.
 * @returns New centroid vectors.
 */
function computeCentroids(
  data: Float32Array[],
  assignments: Uint32Array,
  k: number,
  dim: number
): Float32Array[] {
  const sums = new Array<Float64Array>(k);
  const counts = new Uint32Array(k);

  for (let c = 0; c < k; c++) {
    sums[c] = new Float64Array(dim); // Use Float64 for accumulation precision
  }

  // Accumulate sums and counts
  for (let i = 0; i < data.length; i++) {
    const cluster = assignments[i];
    const point = data[i];
    const sum = sums[cluster];
    counts[cluster]++;
    for (let d = 0; d < dim; d++) {
      sum[d] += point[d];
    }
  }

  // Compute means
  const centroids = new Array<Float32Array>(k);
  for (let c = 0; c < k; c++) {
    centroids[c] = new Float32Array(dim);
    if (counts[c] > 0) {
      const sum = sums[c];
      const centroid = centroids[c];
      for (let d = 0; d < dim; d++) {
        centroid[d] = sum[d] / counts[c];
      }
    } else {
      // Empty cluster -- re-initialize from a random data point
      const randomIdx = Math.floor(Math.random() * data.length);
      centroids[c].set(data[randomIdx]);
    }
  }

  return centroids;
}

/**
 * Compute the maximum squared Euclidean distance between old and new centroids.
 *
 * @param oldCentroids - Previous iteration centroids.
 * @param newCentroids - Current iteration centroids.
 * @returns Maximum centroid movement (squared distance).
 */
function maxCentroidMovement(oldCentroids: Float32Array[], newCentroids: Float32Array[]): number {
  const k = oldCentroids.length;
  const dim = oldCentroids[0].length;
  let maxMove = 0;

  for (let c = 0; c < k; c++) {
    const oldC = oldCentroids[c];
    const newC = newCentroids[c];
    let dist = 0;
    for (let d = 0; d < dim; d++) {
      const diff = oldC[d] - newC[d];
      dist += diff * diff;
    }
    if (dist > maxMove) {
      maxMove = dist;
    }
  }

  return maxMove;
}

/**
 * Cluster data points into k groups using Lloyd's k-means algorithm.
 *
 * Centroids are initialized by randomly sampling k distinct points from the data.
 * The algorithm iterates until convergence (max centroid movement < threshold)
 * or maxIterations is reached.
 *
 * @param data - Array of data points, each a Float32Array of the same dimensionality.
 * @param k - Number of clusters.
 * @param options - Optional clustering parameters.
 * @returns Cluster centroids, assignments, and iteration count.
 * @throws {ValidationError} If data is empty, k < 1, k > data.length, or dimensions are inconsistent.
 *
 * @example
 * ```typescript
 * import { kMeansCluster } from '@localmode/core';
 *
 * const data = vectors.map(v => new Float32Array(v));
 * const { centroids, assignments, iterations } = kMeansCluster(data, 8);
 * ```
 */
export function kMeansCluster(
  data: Float32Array[],
  k: number,
  options?: KMeansOptions
): KMeansResult {
  // ── Validation ──────────────────────────────────────────────
  if (data.length === 0) {
    throw new ValidationError(
      'Cannot cluster empty data: at least one data point is required.',
      'Provide a non-empty array of Float32Array vectors.'
    );
  }

  if (k < 1) {
    throw new ValidationError(
      `Invalid k=${k}: k must be at least 1.`,
      'Provide a positive integer for k.'
    );
  }

  if (k > data.length) {
    throw new ValidationError(
      `k (${k}) cannot exceed the number of data points (${data.length}).`,
      'Reduce k or provide more data points.'
    );
  }

  const dim = data[0].length;
  for (let i = 1; i < data.length; i++) {
    if (data[i].length !== dim) {
      throw new ValidationError(
        `Inconsistent dimensions: data[0] has ${dim} dimensions, but data[${i}] has ${data[i].length}.`,
        'All data points must have the same dimensionality.'
      );
    }
  }

  const maxIterations = options?.maxIterations ?? 20;
  const threshold = options?.threshold ?? 1e-6;
  const abortSignal = options?.abortSignal;

  // ── Initialize centroids by random sampling ─────────────────
  // Fisher-Yates shuffle to pick k distinct indices
  const indices = Array.from({ length: data.length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0 && i >= indices.length - k; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  let centroids: Float32Array[] = [];
  for (let i = 0; i < k; i++) {
    const src = data[indices[data.length - 1 - i]];
    const copy = new Float32Array(dim);
    copy.set(src);
    centroids.push(copy);
  }

  // ── Lloyd's iteration ───────────────────────────────────────
  let iterations = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    abortSignal?.throwIfAborted();

    iterations = iter + 1;

    // Assign points to nearest centroid
    const newAssignments = assignToClusters(data, centroids);

    // Compute new centroids
    const newCentroids = computeCentroids(data, newAssignments, k, dim);

    // Check convergence
    const movement = maxCentroidMovement(centroids, newCentroids);
    centroids = newCentroids;

    if (movement < threshold) {
      break;
    }
  }

  // Final assignment pass to return accurate assignments for the final centroids
  const finalAssignments = assignToClusters(data, centroids);

  return { centroids, assignments: finalAssignments, iterations };
}
