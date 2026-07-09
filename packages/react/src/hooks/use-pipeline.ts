/**
 * @file use-pipeline.ts
 * @description Hook for orchestrating multi-step async workflows
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { PipelineStep, PipelineProgress, UsePipelineReturn } from '../core/types.js';

const IS_SERVER = typeof window === 'undefined';

/**
 * Return type from usePipeline — {@link UsePipelineReturn} plus the run
 * metrics that the core `PipelineResult` reports (`durationMs`,
 * `stepsCompleted`).
 */
export interface UsePipelineWithMetricsReturn<TResult = unknown>
  extends UsePipelineReturn<TResult> {
  /** Wall-clock duration of the last successful run in milliseconds (null until a run completes) */
  durationMs: number | null;
  /** Number of steps executed by the last successful run (null until a run completes) */
  stepsCompleted: number | null;
}

/**
 * Hook for executing multi-step pipelines with unified progress and cancellation.
 *
 * @param steps - Array of pipeline step definitions
 * @returns Pipeline state with progress tracking, run metrics
 *   (`durationMs`, `stepsCompleted`), and execution controls
 *
 * @example
 * ```tsx
 * const { result, isRunning, progress, durationMs, execute, cancel } = usePipeline([
 *   chunkStep({ size: 512 }),
 *   embedStep(model),
 *   searchStep(db, 10),
 * ]);
 * await execute(inputText);
 * ```
 */
export function usePipeline<TResult = unknown>(
  steps: PipelineStep[]
): UsePipelineWithMetricsReturn<TResult> {
  const [result, setResult] = useState<TResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [stepsCompleted, setStepsCompleted] = useState<number | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const execute = useCallback(async (input: unknown): Promise<TResult | null> => {
    if (IS_SERVER) return null;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setError(null);
    setIsRunning(true);
    setResult(null);
    setDurationMs(null);
    setStepsCompleted(null);

    let currentInput = input;
    const totalSteps = stepsRef.current.length;
    const startTime = Date.now();

    try {
      for (let i = 0; i < totalSteps; i++) {
        if (controller.signal.aborted) break;

        const step = stepsRef.current[i];
        if (mountedRef.current) {
          setCurrentStep(step.name);
          setProgress({ completed: i, total: totalSteps, currentStep: step.name });
        }

        currentInput = await step.execute(currentInput, controller.signal);
      }

      if (mountedRef.current && !controller.signal.aborted) {
        const finalResult = currentInput as TResult;
        setResult(finalResult);
        setProgress({ completed: totalSteps, total: totalSteps, currentStep: '' });
        setDurationMs(Date.now() - startTime);
        setStepsCompleted(totalSteps);
        setCurrentStep(null);
        setIsRunning(false);
        return finalResult;
      }
      return null;
    } catch (err) {
      if (!mountedRef.current) return null;

      if (err instanceof Error && err.name === 'AbortError') {
        setIsRunning(false);
        return null;
      }

      setError(err instanceof Error ? err : new Error(String(err)));
      setIsRunning(false);
      return null;
    }
  }, []);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    setResult(null);
    setError(null);
    setCurrentStep(null);
    setProgress(null);
    setDurationMs(null);
    setStepsCompleted(null);
    setIsRunning(false);
  }, []);

  if (IS_SERVER) {
    return {
      result: null,
      isRunning: false,
      error: null,
      currentStep: null,
      progress: null,
      durationMs: null,
      stepsCompleted: null,
      execute: async () => null,
      cancel: () => {},
      reset: () => {},
    };
  }

  return {
    result,
    isRunning,
    error,
    currentStep,
    progress,
    durationMs,
    stepsCompleted,
    execute,
    cancel,
    reset,
  };
}
