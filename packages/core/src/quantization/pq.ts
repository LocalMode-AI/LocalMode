/**
 * @file pq.ts
 * @description Product quantization (PQ) for high-compression vector storage.
 *
 * Divides each vector into m subvectors and encodes each subvector as a single
 * centroid index (1 byte), achieving 8-32x compression over Float32 depending
 * on dimensions and subvector count.
 *
 * All math is pure TypeScript -- no WASM, no external dependencies.
 *
 * @see {@link trainPQ} for codebook training
 * @see {@link pqQuantize} for encoding
 * @see {@link pqDequantize} for decoding
 */

import { ValidationError } from '../errors/index.js';
import { kMeansCluster } from './kmeans.js';
import type { PQCodebook } from './types.js';

/**
 * Options for training a PQ codebook.
 */
export interface PQTrainOptions {
  /**
   * Number of subvector partitions. The vector dimensionality must be
   * evenly divisible by this value.
   * Default: 48 (for 384-dim vectors, each subvector has 8 dimensions).
   */
  subvectors?: number;

  /**
   * Number of centroids per subvector partition.
   * Must be <= 256 to fit each index in a single byte (Uint8).
   * Default: 256.
   */
  centroids?: number;

  /**
   * Maximum number of k-means iterations per subvector partition.
   * Default: 20.
   */
  maxIterations?: number;

  /**
   * Maximum number of vectors to use for training.
   * Set to 0 to use all vectors.
   * Default: 1000.
   */
  calibrationSamples?: number;

  /** AbortSignal to cancel the training. */
  abortSignal?: AbortSignal;
}

/**
 * Train a product quantization codebook from a set of vectors.
 *
 * Divides each vector into `subvectors` partitions and runs k-means clustering
 * independently on each partition, producing a codebook of centroids that can
 * be used to encode and decode vectors.
 *
 * @param vectors - Training vectors. All must have the same dimensionality.
 * @param options - PQ training options (subvectors, centroids, maxIterations).
 * @returns Trained PQ codebook for use with {@link pqQuantize} and {@link pqDequantize}.
 * @throws {ValidationError} If vectors is empty, dimensions not divisible by subvectors,
 *   or centroids > 256.
 *
 * @example
 * ```typescript
 * import { trainPQ, pqQuantize, pqDequantize } from '@localmode/core';
 *
 * const codebook = trainPQ(trainingVectors, { subvectors: 48, centroids: 256 });
 * const encoded = pqQuantize(vector, codebook);   // Uint8Array(48)
 * const decoded = pqDequantize(encoded, codebook); // Float32Array(384)
 * ```
 */
export function trainPQ(vectors: Float32Array[], options: PQTrainOptions = {}): PQCodebook {
  // ── Defaults ────────────────────────────────────────────────
  const m = options.subvectors ?? 48;
  const k = options.centroids ?? 256;
  const maxIterations = options.maxIterations ?? 20;
  const calibrationSamples = options.calibrationSamples ?? 1000;
  const abortSignal = options.abortSignal;

  // ── Validation ──────────────────────────────────────────────
  if (vectors.length === 0) {
    throw new ValidationError(
      'Cannot train PQ codebook: at least one vector is required for training.',
      'Provide a non-empty array of Float32Array vectors.'
    );
  }

  if (k > 256) {
    throw new ValidationError(
      `Centroids (${k}) must be <= 256 to fit in a Uint8 encoding.`,
      'Use centroids <= 256 for PQ. The default is 256.'
    );
  }

  if (k < 1) {
    throw new ValidationError(
      `Centroids (${k}) must be >= 1.`,
      'Provide a positive number of centroids.'
    );
  }

  const dimensions = vectors[0].length;

  if (dimensions % m !== 0) {
    throw new ValidationError(
      `Dimensions (${dimensions}) must be evenly divisible by subvectors (${m}). ` +
      `${dimensions} % ${m} = ${dimensions % m}.`,
      `Choose a subvectors value that divides ${dimensions} evenly ` +
      `(e.g., ${findDivisors(dimensions).join(', ')}).`
    );
  }

  if (m < 1) {
    throw new ValidationError(
      `Subvectors (${m}) must be >= 1.`,
      'Provide a positive number of subvectors.'
    );
  }

  const subvectorDim = dimensions / m;

  // ── Sample training data if needed ──────────────────────────
  let training = vectors;
  if (calibrationSamples > 0 && vectors.length > calibrationSamples) {
    const step = vectors.length / calibrationSamples;
    training = [];
    for (let i = 0; i < calibrationSamples; i++) {
      training.push(vectors[Math.floor(i * step)]);
    }
  }

  // Ensure k does not exceed training size for any partition
  const effectiveK = Math.min(k, training.length);

  // ── Train each subvector partition independently ────────────
  const codebook: Float32Array[][] = new Array(m);

  for (let p = 0; p < m; p++) {
    abortSignal?.throwIfAborted();

    // Extract the p-th subvector from each training vector
    const subData: Float32Array[] = new Array(training.length);
    const offset = p * subvectorDim;

    for (let i = 0; i < training.length; i++) {
      subData[i] = new Float32Array(training[i].buffer, training[i].byteOffset + offset * 4, subvectorDim);
      // Make a copy so k-means can work independently
      const copy = new Float32Array(subvectorDim);
      copy.set(subData[i]);
      subData[i] = copy;
    }

    // Run k-means on this partition
    const result = kMeansCluster(subData, effectiveK, {
      maxIterations,
      abortSignal,
    });

    // If effectiveK < k, pad with duplicates of the last centroid
    codebook[p] = new Array(k);
    for (let c = 0; c < effectiveK; c++) {
      codebook[p][c] = result.centroids[c];
    }
    for (let c = effectiveK; c < k; c++) {
      const padded = new Float32Array(subvectorDim);
      padded.set(result.centroids[effectiveK - 1]);
      codebook[p][c] = padded;
    }
  }

  return {
    subvectors: m,
    centroids: k,
    subvectorDim,
    codebook,
  };
}

/**
 * Encode a Float32Array vector into a compact Uint8Array of centroid indices
 * using a trained PQ codebook.
 *
 * The vector is divided into `codebook.subvectors` partitions. For each
 * partition, the nearest centroid is found and its index stored as a byte.
 *
 * @param vector - The Float32Array vector to quantize.
 * @param codebook - Trained PQ codebook from {@link trainPQ}.
 * @returns Uint8Array of centroid indices, length = codebook.subvectors.
 * @throws {ValidationError} If vector dimensions don't match the codebook.
 *
 * @example
 * ```typescript
 * const encoded = pqQuantize(vector, codebook);
 * // encoded is Uint8Array(48) for a 384-dim vector with 48 subvectors
 * ```
 */
export function pqQuantize(vector: Float32Array, codebook: PQCodebook): Uint8Array {
  const expectedDim = codebook.subvectors * codebook.subvectorDim;
  if (vector.length !== expectedDim) {
    throw new ValidationError(
      `Vector dimension mismatch: expected ${expectedDim} ` +
      `(${codebook.subvectors} subvectors x ${codebook.subvectorDim} dims), ` +
      `got ${vector.length}.`,
      'Ensure the vector has the same dimensionality as the training vectors.'
    );
  }

  const m = codebook.subvectors;
  const subDim = codebook.subvectorDim;
  const codes = new Uint8Array(m);

  for (let p = 0; p < m; p++) {
    const offset = p * subDim;
    const centroids = codebook.codebook[p];
    let bestDist = Infinity;
    let bestIdx = 0;

    for (let c = 0; c < codebook.centroids; c++) {
      const centroid = centroids[c];
      let dist = 0;
      for (let d = 0; d < subDim; d++) {
        const diff = vector[offset + d] - centroid[d];
        dist += diff * diff;
      }

      // Strict less-than ensures lower-indexed centroid wins ties
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = c;
      }
    }

    codes[p] = bestIdx;
  }

  return codes;
}

/**
 * Reconstruct an approximate Float32Array from PQ centroid indices
 * using a trained codebook.
 *
 * Each index is used to look up the corresponding centroid vector,
 * and all centroid vectors are concatenated to form the reconstructed vector.
 *
 * @param quantized - Uint8Array of centroid indices from {@link pqQuantize}.
 * @param codebook - Trained PQ codebook from {@link trainPQ}.
 * @returns Approximate Float32Array reconstruction of the original vector.
 * @throws {ValidationError} If quantized length doesn't match codebook.subvectors.
 *
 * @example
 * ```typescript
 * const decoded = pqDequantize(encoded, codebook);
 * // decoded is Float32Array(384) for a codebook with 48 subvectors x 8 dims
 * ```
 */
export function pqDequantize(quantized: Uint8Array, codebook: PQCodebook): Float32Array {
  if (quantized.length !== codebook.subvectors) {
    throw new ValidationError(
      `Quantized length mismatch: expected ${codebook.subvectors}, got ${quantized.length}.`,
      'The quantized array must have one byte per subvector partition.'
    );
  }

  const m = codebook.subvectors;
  const subDim = codebook.subvectorDim;
  const totalDim = m * subDim;
  const result = new Float32Array(totalDim);

  for (let p = 0; p < m; p++) {
    const centroidIdx = quantized[p];
    const centroid = codebook.codebook[p][centroidIdx];
    const offset = p * subDim;

    for (let d = 0; d < subDim; d++) {
      result[offset + d] = centroid[d];
    }
  }

  return result;
}

/**
 * Find divisors of a number (for hint messages).
 * Returns up to 8 divisors for readability.
 */
function findDivisors(n: number): number[] {
  const divisors: number[] = [];
  for (let i = 1; i <= n && divisors.length < 8; i++) {
    if (n % i === 0) {
      divisors.push(i);
    }
  }
  return divisors;
}
