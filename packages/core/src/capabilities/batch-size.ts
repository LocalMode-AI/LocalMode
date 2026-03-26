/**
 * Adaptive Batch Size Computation
 *
 * Computes an optimal batch size based on device hardware capabilities.
 * The function is synchronous, pure, and zero-dependency — suitable for
 * inline use wherever batch sizes are determined.
 *
 * @packageDocumentation
 */

import type { BatchSizeOptions, BatchSizeResult, BatchTaskType, DeviceProfile } from './types.js';

// ============================================================================
// Task-Type Defaults
// ============================================================================

/**
 * Default batch size parameters per task type.
 *
 * These are calibrated against a "reference device" of 4 cores / 8 GB RAM
 * where the base batch size is known to work well.
 */
const TASK_DEFAULTS: Record<BatchTaskType, { base: number; min: number; max: number }> = {
  embedding: { base: 32, min: 4, max: 256 },
  ingestion: { base: 64, min: 8, max: 512 },
};

/** Reference device cores (normalization denominator) */
const REFERENCE_CORES = 4;

/** Reference device memory in GB (normalization denominator) */
const REFERENCE_MEMORY_GB = 8;

/** Fallback cores when navigator is unavailable */
const FALLBACK_CORES = 4;

/** Fallback memory in GB when navigator.deviceMemory is unavailable */
const FALLBACK_MEMORY_GB = 8;

/** GPU bonus multiplier applied when a GPU is available */
const GPU_MULTIPLIER = 1.5;

// ============================================================================
// Core Function
// ============================================================================

/**
 * Compute an optimal batch size based on device hardware capabilities.
 *
 * Uses the formula:
 * ```
 * Math.max(min, Math.min(max, Math.floor(base * (cores / 4) * (memGB / 8) * gpuMult)))
 * ```
 *
 * The formula normalizes against a reference device (4 cores, 8 GB RAM).
 * Devices with more resources scale up; devices with fewer scale down.
 * The min/max bounds prevent pathological sizes.
 *
 * @param options - Configuration for the computation
 * @returns The computed batch size with reasoning and device profile
 *
 * @example Basic usage (uses browser detection)
 * ```ts
 * import { computeOptimalBatchSize } from '@localmode/core';
 *
 * const { batchSize } = computeOptimalBatchSize({
 *   taskType: 'embedding',
 *   modelDimensions: 384,
 * });
 *
 * for await (const result of streamEmbedMany({
 *   model, values, batchSize,
 * })) {
 *   // ...
 * }
 * ```
 *
 * @example With device overrides (for testing or SSR)
 * ```ts
 * const result = computeOptimalBatchSize({
 *   taskType: 'embedding',
 *   modelDimensions: 384,
 *   deviceCapabilities: { cores: 16, memoryGB: 32, hasGPU: true },
 * });
 *
 * console.log(result.batchSize);     // 256 (clamped to max)
 * console.log(result.reasoning);     // Explains computation
 * console.log(result.deviceProfile); // { cores: 16, memoryGB: 32, hasGPU: true, source: 'override' }
 * ```
 *
 * @example With custom bounds
 * ```ts
 * const result = computeOptimalBatchSize({
 *   taskType: 'embedding',
 *   modelDimensions: 384,
 *   minBatchSize: 16,
 *   maxBatchSize: 64,
 * });
 * ```
 *
 * @throws {never} This function does not throw — it always returns a valid result
 *
 * @see {@link BatchSizeOptions} for all available options
 * @see {@link BatchSizeResult} for the result shape
 * @see {@link DeviceProfile} for the device profile shape
 */
export function computeOptimalBatchSize(options: BatchSizeOptions): BatchSizeResult {
  const { taskType, modelDimensions = 0, deviceCapabilities, minBatchSize, maxBatchSize, baseBatchSize } =
    options;

  // Resolve task-type defaults
  const defaults = TASK_DEFAULTS[taskType];
  const base = baseBatchSize ?? defaults.base;
  const min = minBatchSize ?? defaults.min;
  const max = maxBatchSize ?? defaults.max;

  // Detect or resolve device capabilities
  const deviceProfile = resolveDeviceProfile(deviceCapabilities);

  // Compute GPU multiplier
  const gpuMult = deviceProfile.hasGPU ? GPU_MULTIPLIER : 1.0;

  // Apply formula: base * (cores / refCores) * (memGB / refMem) * gpuMult
  const coreFactor = deviceProfile.cores / REFERENCE_CORES;
  const memoryFactor = deviceProfile.memoryGB / REFERENCE_MEMORY_GB;
  const rawValue = base * coreFactor * memoryFactor * gpuMult;
  const floored = Math.floor(rawValue);

  // Clamp to [min, max]
  const batchSize = Math.max(min, Math.min(max, floored));

  // Build reasoning string
  const reasoning = buildReasoning({
    taskType,
    modelDimensions,
    base,
    min,
    max,
    coreFactor,
    memoryFactor,
    gpuMult,
    rawValue,
    floored,
    batchSize,
    deviceProfile,
  });

  return { batchSize, reasoning, deviceProfile };
}

// ============================================================================
// Device Profile Resolution
// ============================================================================

/**
 * Resolve device capabilities from overrides, browser APIs, or fallbacks.
 */
function resolveDeviceProfile(
  overrides?: BatchSizeOptions['deviceCapabilities']
): DeviceProfile {
  // If any override is provided, mark source as 'override'
  if (overrides !== undefined) {
    const detected = detectHardware();
    return {
      cores: overrides.cores ?? detected.cores,
      memoryGB: overrides.memoryGB ?? detected.memoryGB,
      hasGPU: overrides.hasGPU ?? detected.hasGPU,
      source: 'override',
    };
  }

  // No overrides — detect from browser APIs
  const navigatorAvailable = typeof navigator !== 'undefined';

  if (!navigatorAvailable) {
    // SSR / Node.js environment — use fallbacks
    return {
      cores: FALLBACK_CORES,
      memoryGB: FALLBACK_MEMORY_GB,
      hasGPU: false,
      source: 'fallback',
    };
  }

  // Browser environment — detect from APIs
  return {
    ...detectHardware(),
    source: 'detected',
  };
}

/**
 * Read hardware capabilities from browser APIs with safe fallbacks.
 */
function detectHardware(): Omit<DeviceProfile, 'source'> {
  const navigatorAvailable = typeof navigator !== 'undefined';

  const cores = navigatorAvailable && navigator.hardwareConcurrency
    ? navigator.hardwareConcurrency
    : FALLBACK_CORES;

  const deviceMemory = navigatorAvailable
    ? (navigator as unknown as Record<string, unknown>).deviceMemory
    : undefined;

  const memoryGB = typeof deviceMemory === 'number' && deviceMemory > 0
    ? deviceMemory
    : FALLBACK_MEMORY_GB;

  // GPU detection: check for WebGPU API presence (synchronous check only)
  const hasGPU = navigatorAvailable && typeof (navigator as unknown as Record<string, unknown>).gpu !== 'undefined';

  return { cores, memoryGB, hasGPU };
}

// ============================================================================
// Reasoning Builder
// ============================================================================

/**
 * Build a human-readable reasoning string explaining the computation.
 */
function buildReasoning(params: {
  taskType: string;
  modelDimensions: number;
  base: number;
  min: number;
  max: number;
  coreFactor: number;
  memoryFactor: number;
  gpuMult: number;
  rawValue: number;
  floored: number;
  batchSize: number;
  deviceProfile: DeviceProfile;
}): string {
  const {
    taskType,
    modelDimensions,
    base,
    min,
    max,
    coreFactor,
    memoryFactor,
    gpuMult,
    rawValue,
    floored,
    batchSize,
    deviceProfile,
  } = params;

  const parts: string[] = [];

  parts.push(
    `Task: ${taskType} (${modelDimensions}d). ` +
    `Device: ${deviceProfile.cores} cores, ${deviceProfile.memoryGB}GB RAM, ` +
    `GPU: ${deviceProfile.hasGPU ? 'yes' : 'no'} (source: ${deviceProfile.source}).`
  );

  parts.push(
    `Formula: ${base} * ${coreFactor.toFixed(2)} (cores) * ${memoryFactor.toFixed(2)} (mem) * ${gpuMult.toFixed(1)} (gpu) = ${rawValue.toFixed(1)}.`
  );

  if (floored !== batchSize) {
    if (batchSize === min) {
      parts.push(`Floored to ${floored}, clamped up to min ${min}.`);
    } else {
      parts.push(`Floored to ${floored}, clamped down to max ${max}.`);
    }
  } else {
    parts.push(`Floored to ${floored}.`);
  }

  parts.push(`Result: batchSize=${batchSize} (bounds: [${min}, ${max}]).`);

  return parts.join(' ');
}
