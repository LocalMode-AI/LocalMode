/**
 * @file compression.ts
 * @description Storage compression for IndexedDB vector storage.
 *
 * Compresses Float32Array vectors to Uint8Array using SQ8 quantization for
 * storage, achieving 4x disk reduction without affecting HNSW search recall.
 * Reuses the existing SQ8 math from `quantization/scalar.ts`.
 *
 * Storage compression is independent of vector quantization:
 * - **Vector quantization** (`quantization` config) affects the HNSW index and search recall.
 * - **Storage compression** (`compression` config) only affects disk usage in IndexedDB.
 *
 * @see {@link compressVectors} for compressing vectors before storage
 * @see {@link decompressVectors} for restoring vectors after retrieval
 * @see {@link getCompressionStats} for storage usage statistics
 */

import { calibrate, scalarQuantize, scalarDequantize } from '../quantization/scalar.js';
import type { ScalarCalibrationData } from '../quantization/types.js';
import type { VectorDB, Collection } from '../types.js';
import type { StorageAdapter } from './types.js';
import type { IndexedDBStorage } from './indexeddb.js';
import type { MemoryStorage } from './memory.js';

// ─── Types ──────────────────────────────────────────────────────────

/**
 * A block of compressed vectors produced by {@link compressVectors}.
 *
 * Contains the compressed bytes, calibration data, and mode information
 * needed to decompress the vectors back to Float32Array approximations.
 */
export interface CompressedVectorBlock {
  /** Compressed vector bytes (one Uint8Array per vector) */
  data: Uint8Array[];

  /** Calibration data used for primary SQ8 compression */
  calibration: ScalarCalibrationData;

  /** Compression mode used */
  mode: 'sq8' | 'delta-sq8';

  /** Calibration for delta vectors (present only when mode is 'delta-sq8') */
  deltaCalibration?: ScalarCalibrationData;

  /** Number of vectors in the block */
  count: number;
}

/**
 * Configuration for storage compression on a VectorDB.
 *
 * Storage compression reduces IndexedDB disk usage without affecting
 * HNSW search recall. Independent of the `quantization` option.
 *
 * @example
 * ```typescript
 * const db = await createVectorDB({
 *   name: 'my-db',
 *   dimensions: 384,
 *   compression: { type: 'sq8' },
 * });
 * ```
 */
export interface CompressionConfig {
  /** Compression algorithm: 'sq8' for scalar quantization, 'delta-sq8' for delta encoding + SQ8, 'none' to disable */
  type: 'sq8' | 'delta-sq8' | 'none';

  /**
   * Maximum number of vectors used for calibration.
   * Higher values give better calibration but use more memory.
   * @default 1000
   */
  calibrationSamples?: number;
}

/**
 * Storage compression statistics for a VectorDB collection.
 *
 * @see {@link getCompressionStats} for retrieving these statistics
 */
export interface CompressionStats {
  /** Whether compression is active on the collection */
  enabled: boolean;

  /** Compression mode */
  type: 'sq8' | 'delta-sq8' | 'none';

  /** Number of stored vectors */
  vectorCount: number;

  /** Estimated uncompressed size in bytes (vectorCount * dimensions * 4) */
  originalSizeBytes: number;

  /** Estimated compressed size in bytes (vectorCount * dimensions * bytesPerDimension) */
  compressedSizeBytes: number;

  /** Compression ratio (originalSizeBytes / compressedSizeBytes) */
  ratio: number;

  /** Vector dimensions */
  dimensions: number;
}

// ─── Compression Functions ──────────────────────────────────────────

/**
 * Compress Float32Array vectors to a CompressedVectorBlock using SQ8 quantization.
 *
 * Each Float32 dimension is linearly mapped to a Uint8 value (0-255), achieving
 * 4x storage reduction. The compression is reversible via {@link decompressVectors}.
 *
 * @param vectors - Array of Float32Array vectors to compress. Must not be empty.
 * @param calibration - Optional pre-computed calibration data. If not provided,
 *   calibration is computed from the input vectors.
 * @param mode - Compression mode: 'sq8' (default) or 'delta-sq8'.
 * @returns A CompressedVectorBlock containing compressed vectors and calibration.
 * @throws Error if vectors array is empty.
 *
 * @example
 * ```typescript
 * import { compressVectors } from '@localmode/core';
 *
 * const vectors = [
 *   new Float32Array([0.1, -0.5, 0.3, 0.8]),
 *   new Float32Array([0.4, 0.2, -0.1, 0.6]),
 * ];
 *
 * const block = compressVectors(vectors);
 * // block.data[0] is Uint8Array(4), block.data[1] is Uint8Array(4)
 * // block.calibration contains per-dimension min/max
 * ```
 *
 * @see {@link decompressVectors} for restoring compressed vectors
 */
export function compressVectors(
  vectors: Float32Array[],
  calibration?: ScalarCalibrationData,
  mode: 'sq8' | 'delta-sq8' = 'sq8',
): CompressedVectorBlock {
  if (vectors.length === 0) {
    throw new Error('Cannot compress empty vectors array: at least one vector is required');
  }

  // Auto-calibrate if no calibration provided
  const cal = calibration ?? calibrate(vectors);

  if (mode === 'delta-sq8') {
    return compressDeltaSQ8(vectors, cal);
  }

  // Standard SQ8 compression: quantize each vector individually
  const data: Uint8Array[] = new Array(vectors.length);
  for (let i = 0; i < vectors.length; i++) {
    data[i] = scalarQuantize(vectors[i], cal);
  }

  return {
    data,
    calibration: cal,
    mode: 'sq8',
    count: vectors.length,
  };
}

/**
 * Decompress a CompressedVectorBlock back to Float32Array vectors.
 *
 * Reverses the compression applied by {@link compressVectors}, restoring
 * approximate Float32Array representations. Each dimension is within
 * `(max[d] - min[d]) / 255` of the original value.
 *
 * @param block - The compressed vector block to decompress.
 * @param calibration - Calibration data used during compression.
 * @returns Array of approximate Float32Array vectors.
 *
 * @example
 * ```typescript
 * import { compressVectors, decompressVectors } from '@localmode/core';
 *
 * const block = compressVectors(vectors);
 * const restored = decompressVectors(block, block.calibration);
 * // restored[0] is approximately equal to vectors[0]
 * ```
 *
 * @see {@link compressVectors} for creating compressed blocks
 */
export function decompressVectors(
  block: CompressedVectorBlock,
  calibration: ScalarCalibrationData,
): Float32Array[] {
  if (block.data.length === 0) {
    return [];
  }

  if (block.mode === 'delta-sq8') {
    return decompressDeltaSQ8(block, calibration);
  }

  // Standard SQ8 decompression
  const result: Float32Array[] = new Array(block.data.length);
  for (let i = 0; i < block.data.length; i++) {
    result[i] = scalarDequantize(block.data[i], calibration);
  }
  return result;
}

// ─── Delta Encoding Helpers ─────────────────────────────────────────

/**
 * Compress vectors using delta-SQ8 encoding.
 *
 * The first vector is compressed using standard SQ8. Subsequent vectors
 * are stored as SQ8-encoded deltas (differences from the previous vector).
 * Delta encoding exploits the fact that embeddings from the same model
 * often occupy a narrow region of the vector space.
 */
function compressDeltaSQ8(
  vectors: Float32Array[],
  cal: ScalarCalibrationData,
): CompressedVectorBlock {
  // Single vector: fall back to standard SQ8
  if (vectors.length === 1) {
    return {
      data: [scalarQuantize(vectors[0], cal)],
      calibration: cal,
      mode: 'delta-sq8',
      count: 1,
    };
  }

  const dimensions = vectors[0].length;
  const data: Uint8Array[] = new Array(vectors.length);

  // Compress the first vector with standard SQ8
  data[0] = scalarQuantize(vectors[0], cal);

  // Compute delta vectors (difference between consecutive vectors)
  const deltas: Float32Array[] = new Array(vectors.length - 1);
  for (let i = 1; i < vectors.length; i++) {
    const delta = new Float32Array(dimensions);
    for (let d = 0; d < dimensions; d++) {
      delta[d] = vectors[i][d] - vectors[i - 1][d];
    }
    deltas[i - 1] = delta;
  }

  // Calibrate from deltas
  const deltaCal = calibrate(deltas);

  // Compress each delta
  for (let i = 0; i < deltas.length; i++) {
    data[i + 1] = scalarQuantize(deltas[i], deltaCal);
  }

  return {
    data,
    calibration: cal,
    mode: 'delta-sq8',
    deltaCalibration: deltaCal,
    count: vectors.length,
  };
}

/**
 * Decompress delta-SQ8 encoded vectors.
 *
 * Reconstructs vectors by dequantizing the base vector and then
 * cumulatively adding dequantized deltas.
 */
function decompressDeltaSQ8(
  block: CompressedVectorBlock,
  calibration: ScalarCalibrationData,
): Float32Array[] {
  const result: Float32Array[] = new Array(block.data.length);

  // Decompress the first (base) vector
  result[0] = scalarDequantize(block.data[0], calibration);

  if (block.data.length === 1) {
    return result;
  }

  // Delta calibration must exist for multi-vector delta blocks
  const deltaCal = block.deltaCalibration;
  if (!deltaCal) {
    // Fallback: treat all as standard SQ8 if deltaCalibration is missing
    for (let i = 1; i < block.data.length; i++) {
      result[i] = scalarDequantize(block.data[i], calibration);
    }
    return result;
  }

  // Reconstruct each vector by adding the dequantized delta to the previous vector
  const dimensions = result[0].length;
  for (let i = 1; i < block.data.length; i++) {
    const delta = scalarDequantize(block.data[i], deltaCal);
    const prev = result[i - 1];
    const vec = new Float32Array(dimensions);
    for (let d = 0; d < dimensions; d++) {
      vec[d] = prev[d] + delta[d];
    }
    result[i] = vec;
  }

  return result;
}

// ─── Statistics ─────────────────────────────────────────────────────

/**
 * Get storage compression statistics for a VectorDB collection.
 *
 * Returns information about disk usage savings from storage compression,
 * including original vs compressed size and compression ratio.
 *
 * @param db - The VectorDB instance to get statistics for.
 * @returns Compression statistics for the collection.
 *
 * @example
 * ```typescript
 * import { createVectorDB, getCompressionStats } from '@localmode/core';
 *
 * const db = await createVectorDB({
 *   name: 'docs',
 *   dimensions: 384,
 *   compression: { type: 'sq8' },
 * });
 *
 * // ... add vectors ...
 *
 * const stats = await getCompressionStats(db);
 * console.log(`Compression ratio: ${stats.ratio}x`);
 * console.log(`Saved: ${stats.originalSizeBytes - stats.compressedSizeBytes} bytes`);
 * ```
 *
 * @see {@link CompressionStats} for the returned statistics shape
 */
export async function getCompressionStats(db: VectorDB): Promise<CompressionStats> {
  // Access the internal VectorDB implementation
  const dbImpl = db as unknown as {
    getCollectionName: () => string;
    getCollectionId: () => string;
    getStorage: () => IndexedDBStorage | MemoryStorage | StorageAdapter;
    dimensions: number;
    compressionConfig?: CompressionConfig;
  };

  const storage = dbImpl.getStorage() as {
    getCollectionByName: (name: string) => Promise<Collection | null>;
    countDocuments: (collectionId: string) => Promise<number>;
  };

  const collectionName = dbImpl.getCollectionName();
  const collectionId = dbImpl.getCollectionId();
  const dimensions = dbImpl.dimensions;

  const collection = await storage.getCollectionByName(collectionName);
  const vectorCount = collection
    ? await storage.countDocuments(collectionId)
    : 0;

  // Determine compression type from config or collection metadata
  const compressionType = dbImpl.compressionConfig?.type ?? 'none';
  const enabled = compressionType !== 'none';

  const originalSizeBytes = vectorCount * dimensions * 4;
  // SQ8 and delta-SQ8 both store 1 byte per dimension
  const compressedSizeBytes = enabled
    ? vectorCount * dimensions * 1
    : originalSizeBytes;

  const ratio = compressedSizeBytes > 0
    ? originalSizeBytes / compressedSizeBytes
    : 1.0;

  return {
    enabled,
    type: compressionType,
    vectorCount,
    originalSizeBytes,
    compressedSizeBytes,
    ratio,
    dimensions,
  };
}
