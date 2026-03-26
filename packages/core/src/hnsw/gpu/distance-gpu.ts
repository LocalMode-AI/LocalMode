/**
 * @file distance-gpu.ts
 * @description Standalone GPU distance computer with automatic CPU fallback.
 *
 * Provides `createGPUDistanceComputer()`, a factory that returns a
 * `GPUDistanceComputer` for batch distance computation. When WebGPU is
 * unavailable or the batch size is below the threshold, CPU distance
 * functions are used transparently.
 *
 * @packageDocumentation
 */

import { LocalModeError } from '../../errors/index.js';
import { getDistanceFunction, type DistanceFunction } from '../distance.js';
import { GPUDistanceManager } from './manager.js';
import {
  DEFAULT_BATCH_THRESHOLD,
  type GPUDistanceComputer,
  type GPUDistanceOptions,
} from './types.js';

/**
 * Compute distances using CPU distance functions.
 *
 * @param query - The query vector
 * @param candidates - Array of candidate vectors
 * @param metric - Distance metric
 * @returns Float32Array of distances
 * @internal
 */
function computeDistancesCPU(
  query: Float32Array,
  candidates: Float32Array[],
  metric: DistanceFunction,
): Float32Array {
  const distanceFn = getDistanceFunction(metric);
  const results = new Float32Array(candidates.length);

  for (let i = 0; i < candidates.length; i++) {
    results[i] = distanceFn(query, candidates[i]);
  }

  return results;
}

/**
 * Create a standalone GPU distance computer for batch distance computation.
 *
 * The returned `GPUDistanceComputer` automatically:
 * - Uses GPU compute shaders when the candidate count exceeds `batchThreshold`
 * - Falls back to CPU distance functions for small batches or when WebGPU is unavailable
 * - Invokes the `onFallback` callback when falling back to CPU
 *
 * @param options - Configuration options
 * @returns A GPUDistanceComputer instance
 *
 * @example
 * ```ts
 * import { createGPUDistanceComputer } from '@localmode/core';
 *
 * const gpu = await createGPUDistanceComputer({
 *   batchThreshold: 64,
 *   onFallback: (reason) => console.warn(reason),
 * });
 *
 * const distances = await gpu.computeDistances(query, candidates, 'cosine');
 * gpu.destroy();
 * ```
 */
export async function createGPUDistanceComputer(
  options?: GPUDistanceOptions,
): Promise<GPUDistanceComputer> {
  const batchThreshold = options?.batchThreshold ?? DEFAULT_BATCH_THRESHOLD;
  const onFallback = options?.onFallback;

  // Attempt to initialize GPU manager
  let gpuManager: GPUDistanceManager | null = null;
  let gpuAvailable = false;

  try {
    gpuManager = await GPUDistanceManager.create({ onFallback });
    gpuAvailable = true;
  } catch {
    // WebGPU not available — use CPU fallback silently
    onFallback?.('WebGPU not available');
    gpuAvailable = false;
  }

  let destroyed = false;

  return {
    async computeDistances(
      query: Float32Array,
      candidates: Float32Array[],
      metric: DistanceFunction,
    ): Promise<Float32Array> {
      if (destroyed) {
        throw new LocalModeError(
          'GPUDistanceComputer has been destroyed. Create a new instance.',
          'GPU_DESTROYED',
          { hint: 'Call createGPUDistanceComputer() to get a new computer.' },
        );
      }

      // Below threshold: use CPU
      if (candidates.length < batchThreshold) {
        onFallback?.(`Batch size (${candidates.length}) below threshold (${batchThreshold})`);
        return computeDistancesCPU(query, candidates, metric);
      }

      // GPU not available: use CPU
      if (!gpuAvailable || !gpuManager) {
        onFallback?.('WebGPU not available');
        return computeDistancesCPU(query, candidates, metric);
      }

      // Use GPU
      try {
        return await gpuManager.computeDistances(query, candidates, metric);
      } catch (error) {
        // GPU dispatch failed — fall back to CPU
        const reason = error instanceof Error ? error.message : 'GPU compute failed';
        onFallback?.(`GPU fallback: ${reason}`);
        return computeDistancesCPU(query, candidates, metric);
      }
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      gpuManager?.destroy();
      gpuManager = null;
      gpuAvailable = false;
    },
  };
}
