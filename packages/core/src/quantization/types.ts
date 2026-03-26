/**
 * @file types.ts
 * @description Type definitions for vector quantization.
 *
 * Supports two quantization strategies:
 * - **Scalar (SQ8)**: Maps Float32 to Uint8 per dimension. 4x compression, >95% recall@10.
 * - **Product (PQ)**: Divides vector into subvectors, encodes each as a centroid index.
 *   8-32x compression, 85-92% recall@10.
 */

// ─── Scalar Quantization Types ──────────────────────────────────────

/**
 * Calibration data for scalar quantization.
 * Stores per-dimension min/max values used to map Float32 to Uint8 range.
 */
export interface ScalarCalibrationData {
  /** Per-dimension minimum values observed during calibration */
  min: Float32Array;
  /** Per-dimension maximum values observed during calibration */
  max: Float32Array;
}

// ─── Product Quantization Types ─────────────────────────────────────

/**
 * Trained codebook for product quantization.
 *
 * Contains the cluster centroids for each subvector partition, used to
 * encode vectors as compact centroid index arrays and decode them back
 * to approximate Float32 vectors.
 *
 * @example
 * ```typescript
 * // For 384-dim vectors with m=48 subvectors, k=256 centroids:
 * // codebook.subvectors === 48
 * // codebook.centroids === 256
 * // codebook.subvectorDim === 8  (384 / 48)
 * // codebook.codebook[p][c] is a Float32Array(8) for partition p, centroid c
 * ```
 */
export interface PQCodebook {
  /** Number of subvector partitions (m). */
  subvectors: number;

  /** Number of centroids per subvector partition (k). */
  centroids: number;

  /** Dimension of each subvector (= total dimensions / subvectors). */
  subvectorDim: number;

  /**
   * Centroid vectors organized as `[subvectors][centroids]`.
   * Each entry is a Float32Array of length `subvectorDim`.
   */
  codebook: Float32Array[][];
}

// ─── Quantization Config (Discriminated Union) ──────────────────────

/**
 * Configuration for scalar quantization (SQ8).
 *
 * Maps each Float32 dimension to Uint8 (0-255) using per-dimension min/max
 * calibration. Achieves 4x storage reduction with typically >95% recall@10.
 *
 * @example
 * ```typescript
 * const db = await createVectorDB({
 *   name: 'my-db',
 *   dimensions: 384,
 *   quantization: { type: 'scalar' },
 * });
 * ```
 */
export interface ScalarQuantizationConfig {
  /** Quantization type: scalar (SQ8). */
  type: 'scalar';

  /**
   * Number of vectors to sample for calibration.
   * Higher values give better calibration but use more memory.
   * Default: 1000. Set to 0 to calibrate from all vectors.
   */
  calibrationSamples?: number;
}

/**
 * Configuration for product quantization (PQ).
 *
 * Divides each vector into `subvectors` partitions and encodes each as a
 * single centroid index byte. Achieves 8-32x compression with 85-92% recall@10.
 *
 * @example
 * ```typescript
 * const db = await createVectorDB({
 *   name: 'my-db',
 *   dimensions: 384,
 *   quantization: { type: 'pq' },
 * });
 *
 * // With custom parameters
 * const db2 = await createVectorDB({
 *   name: 'large-db',
 *   dimensions: 768,
 *   quantization: { type: 'pq', subvectors: 96, centroids: 256 },
 * });
 * ```
 */
export interface PQQuantizationConfig {
  /** Quantization type: product quantization. */
  type: 'pq';

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
   * Number of vectors to sample for codebook training.
   * Higher values give better codebook quality but use more memory and time.
   * Default: 1000. Set to 0 to use all vectors.
   */
  calibrationSamples?: number;

  /**
   * Maximum number of k-means iterations per subvector partition.
   * Default: 20.
   */
  maxIterations?: number;
}

/**
 * Configuration for vector quantization.
 *
 * A discriminated union on the `type` field:
 * - `'scalar'` — SQ8, 4x compression, >95% recall
 * - `'pq'` — Product quantization, 8-32x compression, 85-92% recall
 *
 * @example
 * ```typescript
 * // Scalar quantization (4x compression)
 * const sq = await createVectorDB({
 *   name: 'sq-db', dimensions: 384,
 *   quantization: { type: 'scalar' },
 * });
 *
 * // Product quantization (32x compression for 384-dim)
 * const pq = await createVectorDB({
 *   name: 'pq-db', dimensions: 384,
 *   quantization: { type: 'pq' },
 * });
 * ```
 */
export type QuantizationConfig = ScalarQuantizationConfig | PQQuantizationConfig;
