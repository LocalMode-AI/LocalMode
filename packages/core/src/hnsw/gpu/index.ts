/**
 * @file index.ts
 * @description Barrel export for WebGPU-accelerated vector distance computation module.
 *
 * @packageDocumentation
 */

// Types
export type {
  HNSWGPUOptions,
  GPUDistanceOptions,
  GPUDistanceComputer,
  GPUBufferEntry,
  GPUManagerOptions,
} from './types.js';

export { DEFAULT_BATCH_THRESHOLD, WORKGROUP_SIZE } from './types.js';

// Shaders
export {
  COSINE_DISTANCE_SHADER,
  EUCLIDEAN_DISTANCE_SHADER,
  DOT_PRODUCT_DISTANCE_SHADER,
  getShaderSource,
} from './shaders.js';

// Manager
export { GPUDistanceManager } from './manager.js';

// Standalone API
export { createGPUDistanceComputer } from './distance-gpu.js';
