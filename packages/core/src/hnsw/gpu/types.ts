/**
 * @file types.ts
 * @description Type definitions for WebGPU-accelerated vector distance computation.
 *
 * Defines configuration interfaces for GPU acceleration in HNSW indexing,
 * the standalone GPU distance computer interface, and internal buffer pool types.
 *
 * @packageDocumentation
 */

import type { DistanceFunction } from '../distance.js';

// ============================================================================
// Public Configuration Types
// ============================================================================

/**
 * GPU acceleration options for HNSW index search.
 *
 * When `enabled` is true, the HNSW index uses WebGPU compute shaders for
 * batch distance computation during search. Falls back to CPU when WebGPU
 * is unavailable or when the candidate count is below `batchThreshold`.
 *
 * @example
 * ```ts
 * import { createVectorDB } from '@localmode/core';
 *
 * const db = await createVectorDB({
 *   name: 'docs',
 *   dimensions: 384,
 *   indexOptions: {
 *     gpu: {
 *       enabled: true,
 *       batchThreshold: 64,
 *       onFallback: (reason) => console.log('GPU fallback:', reason),
 *     },
 *   },
 * });
 * ```
 */
export interface HNSWGPUOptions {
  /** Whether to enable GPU-accelerated distance computation. Default: false */
  enabled?: boolean;

  /**
   * Minimum number of candidates to use GPU dispatch.
   * Below this threshold, CPU distance functions are used because
   * GPU dispatch overhead would dominate. Default: 64
   */
  batchThreshold?: number;

  /**
   * Optional callback invoked when falling back to CPU distance computation.
   * Receives a string describing the fallback reason.
   */
  onFallback?: (reason: string) => void;
}

/**
 * Options for the standalone GPU distance computer factory.
 *
 * @example
 * ```ts
 * import { createGPUDistanceComputer } from '@localmode/core';
 *
 * const gpu = await createGPUDistanceComputer({
 *   batchThreshold: 32,
 *   onFallback: (reason) => console.warn('GPU fallback:', reason),
 * });
 * ```
 */
export interface GPUDistanceOptions {
  /**
   * Minimum number of candidates to use GPU dispatch.
   * Below this threshold, CPU distance functions are used. Default: 64
   */
  batchThreshold?: number;

  /**
   * Optional callback invoked when falling back to CPU distance computation.
   * Receives a string describing the fallback reason.
   */
  onFallback?: (reason: string) => void;
}

/**
 * Standalone GPU distance computer for batch distance computation.
 *
 * Created via `createGPUDistanceComputer()`. Manages GPU lifecycle internally
 * and provides automatic CPU fallback when WebGPU is unavailable or when
 * the candidate count is below the batch threshold.
 *
 * @example
 * ```ts
 * const gpu = await createGPUDistanceComputer();
 *
 * const distances = await gpu.computeDistances(
 *   queryVector,
 *   candidateVectors,
 *   'cosine'
 * );
 *
 * // Clean up GPU resources when done
 * gpu.destroy();
 * ```
 */
export interface GPUDistanceComputer {
  /**
   * Compute distances between a query vector and an array of candidate vectors.
   *
   * @param query - The query vector (Float32Array)
   * @param candidates - Array of candidate vectors (Float32Array[])
   * @param metric - Distance metric ('cosine', 'euclidean', or 'dot')
   * @returns Float32Array of distances, one per candidate
   */
  computeDistances(
    query: Float32Array,
    candidates: Float32Array[],
    metric: DistanceFunction,
  ): Promise<Float32Array>;

  /**
   * Release all GPU resources.
   * After calling destroy(), subsequent computeDistances() calls will throw.
   */
  destroy(): void;
}

// ============================================================================
// Internal Types
// ============================================================================

/**
 * Internal buffer pool entry for GPU buffer reuse.
 * @internal
 */
export interface GPUBufferEntry {
  /** The GPU buffer */
  buffer: GPUBuffer;
  /** Size of the buffer in bytes */
  size: number;
}

/**
 * Internal options for the GPU distance manager.
 * @internal
 */
export interface GPUManagerOptions {
  /** Optional callback for fallback notifications */
  onFallback?: (reason: string) => void;
}

/** Default batch threshold: below this candidate count, CPU is faster */
export const DEFAULT_BATCH_THRESHOLD = 64;

/** Workgroup size for WGSL compute shaders */
export const WORKGROUP_SIZE = 256;
