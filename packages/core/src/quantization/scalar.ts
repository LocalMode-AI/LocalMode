/**
 * @file scalar.ts
 * @description Scalar quantization (SQ8) for vector compression.
 *
 * Maps each Float32 dimension to a Uint8 value (0-255) using per-dimension
 * min/max calibration. Achieves 4x storage reduction with typical >95% recall@10.
 *
 * All math is pure TypeScript — no WASM, no external dependencies.
 */

import type { ScalarCalibrationData } from './types.js';

/**
 * Calibrate per-dimension min/max from a set of vectors.
 *
 * The calibration data captures the range of values in each dimension,
 * which is used to linearly map Float32 values to the Uint8 [0, 255] range.
 *
 * @param vectors - Array of Float32Array vectors to calibrate from.
 *   All vectors must have the same length.
 * @returns Calibration data with per-dimension min and max values.
 * @throws Error if vectors array is empty.
 *
 * @example
 * ```typescript
 * const vectors = [
 *   new Float32Array([0.1, -0.5, 0.3]),
 *   new Float32Array([0.4, 0.2, -0.1]),
 * ];
 * const calibration = calibrate(vectors);
 * // calibration.min = Float32Array([0.1, -0.5, -0.1])
 * // calibration.max = Float32Array([0.4,  0.2,  0.3])
 * ```
 */
export function calibrate(vectors: Float32Array[]): ScalarCalibrationData {
  if (vectors.length === 0) {
    throw new Error('Cannot calibrate with zero vectors');
  }

  const dimensions = vectors[0].length;
  const min = new Float32Array(dimensions);
  const max = new Float32Array(dimensions);

  // Initialize from first vector
  for (let d = 0; d < dimensions; d++) {
    min[d] = vectors[0][d];
    max[d] = vectors[0][d];
  }

  // Scan remaining vectors
  for (let i = 1; i < vectors.length; i++) {
    const vec = vectors[i];
    for (let d = 0; d < dimensions; d++) {
      const val = vec[d];
      if (val < min[d]) min[d] = val;
      if (val > max[d]) max[d] = val;
    }
  }

  return { min, max };
}

/**
 * Quantize a Float32Array vector to Uint8Array using scalar quantization.
 *
 * Each dimension is linearly mapped from [min, max] to [0, 255].
 * Values outside the calibrated range are clamped to 0 or 255.
 *
 * @param vector - The Float32Array vector to quantize.
 * @param calibration - Calibration data from {@link calibrate}.
 * @returns Quantized Uint8Array representation of the vector.
 *
 * @example
 * ```typescript
 * const quantized = scalarQuantize(vector, calibration);
 * // quantized is Uint8Array with values 0-255
 * ```
 */
export function scalarQuantize(
  vector: Float32Array,
  calibration: ScalarCalibrationData
): Uint8Array {
  const dimensions = vector.length;
  const quantized = new Uint8Array(dimensions);
  const { min, max } = calibration;

  for (let d = 0; d < dimensions; d++) {
    const range = max[d] - min[d];
    if (range === 0) {
      // Constant dimension — map to midpoint
      quantized[d] = 128;
    } else {
      // Linear map to [0, 255], clamped
      const normalized = (vector[d] - min[d]) / range;
      quantized[d] = Math.max(0, Math.min(255, Math.round(normalized * 255)));
    }
  }

  return quantized;
}

/**
 * Dequantize a Uint8Array back to Float32Array using scalar dequantization.
 *
 * Reverses the mapping from [0, 255] back to the original [min, max] range.
 * The result is an approximation of the original vector.
 *
 * @param quantized - The Uint8Array quantized vector.
 * @param calibration - Calibration data used during quantization.
 * @returns Approximate Float32Array reconstruction of the original vector.
 *
 * @example
 * ```typescript
 * const restored = scalarDequantize(quantized, calibration);
 * // restored is Float32Array, approximately equal to original
 * ```
 */
export function scalarDequantize(
  quantized: Uint8Array,
  calibration: ScalarCalibrationData
): Float32Array {
  const dimensions = quantized.length;
  const restored = new Float32Array(dimensions);
  const { min, max } = calibration;

  for (let d = 0; d < dimensions; d++) {
    const range = max[d] - min[d];
    if (range === 0) {
      // Constant dimension — restore to original value
      restored[d] = min[d];
    } else {
      restored[d] = (quantized[d] / 255) * range + min[d];
    }
  }

  return restored;
}

/**
 * Merge new calibration data with existing calibration data.
 *
 * Expands the min/max ranges to encompass both calibration sets.
 * Useful when adding new vectors that may have values outside the
 * originally calibrated range.
 *
 * @param existing - The existing calibration data.
 * @param incoming - New calibration data to merge.
 * @returns Merged calibration data with expanded ranges.
 */
export function mergeCalibration(
  existing: ScalarCalibrationData,
  incoming: ScalarCalibrationData
): ScalarCalibrationData {
  const dimensions = existing.min.length;
  const min = new Float32Array(dimensions);
  const max = new Float32Array(dimensions);

  for (let d = 0; d < dimensions; d++) {
    min[d] = Math.min(existing.min[d], incoming.min[d]);
    max[d] = Math.max(existing.max[d], incoming.max[d]);
  }

  return { min, max };
}
