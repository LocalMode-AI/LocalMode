/**
 * Model Evaluation Orchestrator
 *
 * Runs a model against a dataset, applies a metric function,
 * and returns a structured evaluation report.
 *
 * @packageDocumentation
 */

import { ValidationError } from '../errors/index.js';
import type { EvaluateModelOptions, EvaluateModelResult } from './types.js';

/**
 * Evaluate a model against a dataset using a metric function.
 *
 * Iterates over dataset inputs, calling the `predict` function for each item,
 * then scores all predictions against expected values using the provided metric.
 * Supports cancellation via `AbortSignal` and progress tracking via `onProgress`.
 *
 * @typeParam TInput - The type of dataset inputs
 * @typeParam TOutput - The type of model outputs and expected values
 * @param options - Evaluation configuration
 * @returns Evaluation result with score, predictions, dataset size, and duration
 *
 * @example
 * ```ts
 * import { evaluateModel, accuracy } from '@localmode/core';
 *
 * const result = await evaluateModel({
 *   dataset: {
 *     inputs: ['great movie', 'terrible film', 'okay show'],
 *     expected: ['positive', 'negative', 'neutral'],
 *   },
 *   predict: async (text, signal) => {
 *     const { label } = await classify({ model, text, abortSignal: signal });
 *     return label;
 *   },
 *   metric: accuracy,
 * });
 *
 * console.log(result.score);       // 0.67
 * console.log(result.predictions); // ['positive', 'negative', 'positive']
 * console.log(result.durationMs);  // 1234
 * ```
 *
 * @example With progress tracking and cancellation
 * ```ts
 * const controller = new AbortController();
 *
 * const result = await evaluateModel({
 *   dataset,
 *   predict,
 *   metric: f1Score,
 *   abortSignal: controller.signal,
 *   onProgress: (completed, total) => {
 *     console.log(`${completed}/${total}`);
 *   },
 * });
 * ```
 *
 * @throws {ValidationError} If dataset is empty or inputs/expected have mismatched lengths
 * @throws {Error} If aborted via AbortSignal
 *
 * @see {@link accuracy} for classification accuracy
 * @see {@link f1Score} for F1 metric
 * @see {@link mrr} for retrieval MRR
 */
export async function evaluateModel<TInput, TOutput>(
  options: EvaluateModelOptions<TInput, TOutput>,
): Promise<EvaluateModelResult<TOutput>> {
  const { dataset, predict, metric, abortSignal, onProgress } = options;

  // Validate dataset
  if (dataset.inputs.length === 0) {
    throw new ValidationError(
      'evaluateModel requires at least one input in the dataset',
      'Provide a non-empty dataset with at least one input and expected value.',
    );
  }

  if (dataset.inputs.length !== dataset.expected.length) {
    throw new ValidationError(
      `evaluateModel requires dataset inputs and expected to have equal length, got ${dataset.inputs.length} inputs and ${dataset.expected.length} expected`,
      'Ensure dataset.inputs and dataset.expected arrays have the same length.',
    );
  }

  // Check for cancellation before starting
  abortSignal?.throwIfAborted();

  const start = performance.now();
  const predictions: TOutput[] = [];

  // Create an internal AbortController if no signal is provided
  const internalController = new AbortController();
  const signal = abortSignal ?? internalController.signal;

  for (let i = 0; i < dataset.inputs.length; i++) {
    // Check for cancellation before each prediction
    abortSignal?.throwIfAborted();

    const prediction = await predict(dataset.inputs[i], signal);
    predictions.push(prediction);

    // Report progress after each prediction
    onProgress?.(i + 1, dataset.inputs.length);
  }

  // Compute the metric score
  const score = metric(predictions, dataset.expected);
  const durationMs = performance.now() - start;

  return {
    score,
    predictions,
    datasetSize: dataset.inputs.length,
    durationMs,
  };
}
