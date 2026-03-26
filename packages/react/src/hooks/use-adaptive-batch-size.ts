/**
 * @file use-adaptive-batch-size.ts
 * @description Hook for computing an optimal batch size based on device capabilities
 */

import { useMemo } from 'react';
import type { BatchSizeOptions, BatchSizeResult } from '@localmode/core';
import { computeOptimalBatchSize } from '@localmode/core';

/**
 * Hook for computing an optimal batch size based on device hardware capabilities.
 *
 * Wraps the synchronous `computeOptimalBatchSize()` from `@localmode/core`
 * and re-computes when the provided options change.
 *
 * Since the underlying function is synchronous, this hook has no loading
 * or error states — it returns the result directly.
 *
 * @param options - Configuration for the batch size computation
 * @returns The computed batch size with reasoning and device profile
 *
 * @example
 * ```tsx
 * import { useAdaptiveBatchSize } from '@localmode/react';
 *
 * function MyComponent() {
 *   const { batchSize, reasoning, deviceProfile } = useAdaptiveBatchSize({
 *     taskType: 'embedding',
 *     modelDimensions: 384,
 *   });
 *
 *   return (
 *     <div>
 *       <p>Optimal batch size: {batchSize}</p>
 *       <p>Device: {deviceProfile.cores} cores, {deviceProfile.memoryGB}GB RAM</p>
 *       <details>
 *         <summary>Reasoning</summary>
 *         <p>{reasoning}</p>
 *       </details>
 *     </div>
 *   );
 * }
 * ```
 *
 * @see {@link computeOptimalBatchSize} for the underlying computation
 */
export function useAdaptiveBatchSize(options: BatchSizeOptions): BatchSizeResult {
  const {
    taskType,
    modelDimensions,
    deviceCapabilities,
    minBatchSize,
    maxBatchSize,
    baseBatchSize,
  } = options;

  // Re-compute when any option changes
  const result = useMemo(
    () =>
      computeOptimalBatchSize({
        taskType,
        modelDimensions,
        deviceCapabilities,
        minBatchSize,
        maxBatchSize,
        baseBatchSize,
      }),
    [
      taskType,
      modelDimensions,
      deviceCapabilities?.cores,
      deviceCapabilities?.memoryGB,
      deviceCapabilities?.hasGPU,
      minBatchSize,
      maxBatchSize,
      baseBatchSize,
    ]
  );

  return result;
}
