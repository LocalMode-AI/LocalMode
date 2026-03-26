/**
 * @file index.ts
 * @description Vector quantization module.
 *
 * Provides two quantization strategies for reducing vector storage:
 * - **Scalar (SQ8)**: 4x compression, >95% recall. Phase 1 storage-only.
 * - **Product (PQ)**: 8-32x compression, 85-92% recall. Phase 1 storage-only.
 *
 * Both strategies quantize vectors in storage while the HNSW index keeps
 * Float32Array in memory for maximum search accuracy.
 */

// Types
export type {
  ScalarCalibrationData,
  QuantizationConfig,
  ScalarQuantizationConfig,
  PQQuantizationConfig,
  PQCodebook,
} from './types.js';

// Scalar quantization (SQ8)
export { calibrate, scalarQuantize, scalarDequantize, mergeCalibration } from './scalar.js';

// K-means clustering
export { kMeansCluster } from './kmeans.js';
export type { KMeansOptions, KMeansResult } from './kmeans.js';

// Product quantization (PQ)
export { trainPQ, pqQuantize, pqDequantize } from './pq.js';
export type { PQTrainOptions } from './pq.js';
