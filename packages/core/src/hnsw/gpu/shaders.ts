/**
 * @file shaders.ts
 * @description WGSL compute shader source strings for GPU-accelerated vector distance computation.
 *
 * Each shader computes distances between a single query vector and N candidate vectors
 * in parallel, using one thread per candidate. Shaders use @workgroup_size(256),
 * which is within the minimum guaranteed workgroup size for all WebGPU implementations.
 *
 * Shader bindings layout:
 * - @group(0) @binding(0): query vector (storage, read)
 * - @group(0) @binding(1): packed candidate vectors (storage, read)
 * - @group(0) @binding(2): result distances (storage, read_write)
 * - @group(0) @binding(3): params uniform (dimensions, candidate_count)
 *
 * @packageDocumentation
 */

import type { DistanceFunction } from '../distance.js';

/**
 * WGSL compute shader for cosine distance.
 *
 * Computes `1.0 - dot(a, b) / (||a|| * ||b||)` per candidate.
 * Returns 1.0 (maximum distance) for zero-magnitude vectors,
 * matching the CPU `cosineDistance()` behavior.
 */
export const COSINE_DISTANCE_SHADER = /* wgsl */ `
struct Params {
  dimensions: u32,
  candidate_count: u32,
}

@group(0) @binding(0) var<storage, read> query: array<f32>;
@group(0) @binding(1) var<storage, read> candidates: array<f32>;
@group(0) @binding(2) var<storage, read_write> results: array<f32>;
@group(0) @binding(3) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.candidate_count) {
    return;
  }

  let offset = idx * params.dimensions;
  var dot_product: f32 = 0.0;
  var norm_a: f32 = 0.0;
  var norm_b: f32 = 0.0;

  for (var i: u32 = 0u; i < params.dimensions; i = i + 1u) {
    let a = query[i];
    let b = candidates[offset + i];
    dot_product = dot_product + a * b;
    norm_a = norm_a + a * a;
    norm_b = norm_b + b * b;
  }

  let magnitude = sqrt(norm_a) * sqrt(norm_b);
  if (magnitude == 0.0) {
    results[idx] = 1.0;
  } else {
    results[idx] = 1.0 - dot_product / magnitude;
  }
}
`;

/**
 * WGSL compute shader for Euclidean (L2) distance.
 *
 * Computes `sqrt(sum((a[d] - b[d])^2))` per candidate.
 */
export const EUCLIDEAN_DISTANCE_SHADER = /* wgsl */ `
struct Params {
  dimensions: u32,
  candidate_count: u32,
}

@group(0) @binding(0) var<storage, read> query: array<f32>;
@group(0) @binding(1) var<storage, read> candidates: array<f32>;
@group(0) @binding(2) var<storage, read_write> results: array<f32>;
@group(0) @binding(3) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.candidate_count) {
    return;
  }

  let offset = idx * params.dimensions;
  var sum: f32 = 0.0;

  for (var i: u32 = 0u; i < params.dimensions; i = i + 1u) {
    let diff = query[i] - candidates[offset + i];
    sum = sum + diff * diff;
  }

  results[idx] = sqrt(sum);
}
`;

/**
 * WGSL compute shader for dot product distance.
 *
 * Computes `-sum(a[d] * b[d])` per candidate. The result is negated because
 * HNSW expects lower values = better (more similar), while raw dot product
 * is higher = more similar for normalized vectors.
 */
export const DOT_PRODUCT_DISTANCE_SHADER = /* wgsl */ `
struct Params {
  dimensions: u32,
  candidate_count: u32,
}

@group(0) @binding(0) var<storage, read> query: array<f32>;
@group(0) @binding(1) var<storage, read> candidates: array<f32>;
@group(0) @binding(2) var<storage, read_write> results: array<f32>;
@group(0) @binding(3) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.candidate_count) {
    return;
  }

  let offset = idx * params.dimensions;
  var dot_sum: f32 = 0.0;

  for (var i: u32 = 0u; i < params.dimensions; i = i + 1u) {
    dot_sum = dot_sum + query[i] * candidates[offset + i];
  }

  results[idx] = -dot_sum;
}
`;

/**
 * Get the WGSL shader source string for a given distance metric.
 *
 * @param metric - The distance metric ('cosine', 'euclidean', or 'dot')
 * @returns The WGSL shader source string
 *
 * @example
 * ```ts
 * const shaderCode = getShaderSource('cosine');
 * const shaderModule = device.createShaderModule({ code: shaderCode });
 * ```
 */
export function getShaderSource(metric: DistanceFunction): string {
  switch (metric) {
    case 'cosine':
      return COSINE_DISTANCE_SHADER;
    case 'euclidean':
      return EUCLIDEAN_DISTANCE_SHADER;
    case 'dot':
      return DOT_PRODUCT_DISTANCE_SHADER;
    default:
      return COSINE_DISTANCE_SHADER;
  }
}
