/**
 * Evaluation SDK
 *
 * Pure math metric functions for classification, text generation,
 * retrieval, and vector quality evaluation. Plus an orchestrator
 * for running models against datasets.
 *
 * @packageDocumentation
 */

// Metric functions
export {
  accuracy,
  precision,
  recall,
  f1Score,
  bleuScore,
  rougeScore,
  cosineDistance,
  mrr,
  ndcg,
  confusionMatrix,
} from './metrics.js';

// Orchestrator
export { evaluateModel } from './evaluate.js';

// Types
export type {
  MetricFunction,
  EvaluateModelOptions,
  EvaluateModelResult,
  ConfusionMatrix,
} from './types.js';
