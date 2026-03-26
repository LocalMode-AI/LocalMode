/**
 * @file use-evaluate-model.ts
 * @description Hook for model evaluation with @localmode/core evaluateModel()
 */

import type { EvaluateModelOptions, EvaluateModelResult } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/**
 * Hook for evaluating a model against a dataset.
 *
 * Wraps `evaluateModel()` with loading/error/cancel state management.
 * All configuration is passed at execute time, not at hook initialization.
 *
 * @returns Operation state with execute(options) function
 *
 * @example
 * ```tsx
 * import { useEvaluateModel } from '@localmode/react';
 * import { accuracy } from '@localmode/core';
 *
 * function EvalPanel() {
 *   const { data, isLoading, error, execute, cancel } = useEvaluateModel();
 *
 *   const runEval = () => execute({
 *     dataset: { inputs: texts, expected: labels },
 *     predict: async (text, signal) => {
 *       const { label } = await classify({ model, text, abortSignal: signal });
 *       return label;
 *     },
 *     metric: accuracy,
 *   });
 *
 *   return (
 *     <div>
 *       <button onClick={runEval} disabled={isLoading}>Evaluate</button>
 *       {isLoading && <button onClick={cancel}>Cancel</button>}
 *       {data && <p>Score: {data.score}</p>}
 *       {error && <p>Error: {error.message}</p>}
 *     </div>
 *   );
 * }
 * ```
 *
 * @see {@link evaluateModel} in `@localmode/core` for the underlying function
 */
export function useEvaluateModel<TInput = unknown, TOutput = unknown>() {
  return useOperation<[EvaluateModelOptions<TInput, TOutput>], EvaluateModelResult<TOutput>>({
    fn: async (
      options: EvaluateModelOptions<TInput, TOutput>,
      signal: AbortSignal,
    ) => {
      const { evaluateModel } = await import('@localmode/core');
      return evaluateModel({ ...options, abortSignal: signal });
    },
  });
}
