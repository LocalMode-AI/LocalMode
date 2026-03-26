/**
 * @file use-calibrate-threshold.ts
 * @description Hook for empirical similarity threshold calibration from corpus embedding distribution
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type {
  EmbeddingModel,
  ThresholdCalibration,
} from '@localmode/core';

/** Options for the useCalibrateThreshold hook */
export interface UseCalibrateThresholdOptions {
  /** The embedding model to use (model object or string 'provider:modelId') */
  model: EmbeddingModel | string;

  /**
   * Percentile of the pairwise similarity distribution to use as threshold.
   * @defaultValue 90
   */
  percentile?: number;

  /**
   * Distance metric for similarity computation.
   * @defaultValue 'cosine'
   */
  distanceFunction?: 'cosine' | 'euclidean' | 'dot';

  /**
   * Maximum number of corpus samples to use for calibration.
   * @defaultValue 200
   */
  maxSamples?: number;
}

/** Return type from useCalibrateThreshold */
export interface UseCalibrateThresholdReturn {
  /** The calibration result (null until calibrated) */
  calibration: ThresholdCalibration | null;

  /** Whether calibration is in progress */
  isCalibrating: boolean;

  /** Error state (null if no error) */
  error: { message: string } | null;

  /** Start calibration with the given corpus */
  calibrate: (corpus: string[]) => Promise<ThresholdCalibration | null>;

  /** Cancel the current calibration */
  cancel: () => void;

  /** Clear the error state */
  clearError: () => void;
}

const IS_SERVER = typeof window === 'undefined';

/**
 * Hook for empirical similarity threshold calibration.
 *
 * Wraps `calibrateThreshold()` from `@localmode/core` with React state
 * management for loading, error handling, and cancellation.
 *
 * @param options - Calibration configuration
 * @returns State and actions for controlling the calibration operation
 *
 * @example
 * ```tsx
 * const { calibration, isCalibrating, error, calibrate, cancel } = useCalibrateThreshold({
 *   model: transformers.embedding('Xenova/bge-small-en-v1.5'),
 * });
 *
 * return (
 *   <div>
 *     <button onClick={() => calibrate(corpus)} disabled={isCalibrating}>
 *       Calibrate
 *     </button>
 *     {isCalibrating && <p>Calibrating...</p>}
 *     {calibration && <p>Threshold: {calibration.threshold.toFixed(4)}</p>}
 *     {error && <p>Error: {error.message}</p>}
 *   </div>
 * );
 * ```
 */
export function useCalibrateThreshold(
  options: UseCalibrateThresholdOptions
): UseCalibrateThresholdReturn {
  const { model, percentile, distanceFunction, maxSamples } = options;

  const [calibration, setCalibration] = useState<ThresholdCalibration | null>(null);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [error, setError] = useState<{ message: string } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const calibrate = useCallback(
    async (corpus: string[]): Promise<ThresholdCalibration | null> => {
      if (IS_SERVER) return null;

      // Abort any previous operation
      abortControllerRef.current?.abort();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setError(null);
      setIsCalibrating(true);
      setCalibration(null);

      try {
        const { calibrateThreshold } = await import('@localmode/core');
        const result = await calibrateThreshold({
          model,
          corpus,
          percentile,
          distanceFunction,
          maxSamples,
          abortSignal: controller.signal,
        });

        if (mountedRef.current && !controller.signal.aborted) {
          setCalibration(result);
          setIsCalibrating(false);
          return result;
        }
        return null;
      } catch (err) {
        if (!mountedRef.current) return null;

        // Abort errors are silent
        if (err instanceof DOMException && err.name === 'AbortError') {
          setIsCalibrating(false);
          return null;
        }
        if (err instanceof Error && err.name === 'AbortError') {
          setIsCalibrating(false);
          return null;
        }

        const message = err instanceof Error ? err.message : String(err);
        setError({ message });
        setIsCalibrating(false);
        return null;
      }
    },
    [model, percentile, distanceFunction, maxSamples]
  );

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // SSR: return inert state
  if (IS_SERVER) {
    return {
      calibration: null,
      isCalibrating: false,
      error: null,
      calibrate: async () => null,
      cancel: () => {},
      clearError: () => {},
    };
  }

  return { calibration, isCalibrating, error, calibrate, cancel, clearError };
}
