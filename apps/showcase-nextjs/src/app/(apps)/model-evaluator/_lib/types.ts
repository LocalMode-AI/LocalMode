/**
 * @file types.ts
 * @description Type definitions for the model evaluator application
 */

import type { ConfusionMatrix } from '@localmode/core';

/** Active tab in the evaluator */
export type EvaluatorTab = 'evaluate' | 'calibrate';

/** Single entry in a labeled dataset */
export interface DatasetEntry {
  /** Input text to classify */
  input: string;
  /** Expected ground-truth label */
  expected: string;
}

/** A built-in sample dataset for evaluation */
export interface SampleDataset {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Labeled data entries */
  entries: DatasetEntry[];
}

/** A selectable model option */
export interface ModelOption {
  /** Model identifier (HuggingFace ID) */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Approximate download size */
  size: string;
}

/** Computed evaluation metrics */
export interface EvaluationMetrics {
  /** Fraction of correct predictions (0-1) */
  accuracy: number;
  /** Macro-averaged precision (0-1) */
  precision: number;
  /** Macro-averaged recall (0-1) */
  recall: number;
  /** Macro-averaged F1 score (0-1) */
  f1: number;
}

/** Full evaluation results after a completed run */
export interface EvaluationResults {
  /** Computed metric scores */
  metrics: EvaluationMetrics;
  /** Array of predicted labels */
  predictions: string[];
  /** Array of ground-truth labels */
  expected: string[];
  /** Confusion matrix from @localmode/core */
  confusionMatrix: ConfusionMatrix;
  /** Number of items evaluated */
  datasetSize: number;
  /** Total evaluation duration in milliseconds */
  durationMs: number;
  /** Model identifier used */
  modelId: string;
  /** Dataset name used */
  datasetName: string;
}

/** Progress state during evaluation */
export interface EvaluationProgress {
  /** Number of predictions completed */
  completed: number;
  /** Total number of predictions */
  total: number;
}

/** A built-in sample corpus for threshold calibration */
export interface SampleCorpus {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Corpus text samples */
  texts: string[];
}

/** Calibration results combining calibrated and preset thresholds */
export interface CalibrationResults {
  /** The calibrated threshold value */
  threshold: number;
  /** Percentile used for calibration */
  percentile: number;
  /** Number of corpus samples used */
  sampleSize: number;
  /** Model identifier */
  modelId: string;
  /** Distance function used */
  distanceFunction: string;
  /** Distribution statistics */
  distribution: {
    mean: number;
    median: number;
    stdDev: number;
    min: number;
    max: number;
    count: number;
  };
  /** Preset threshold for comparison (undefined if no preset) */
  presetThreshold?: number;
}

/** Application error for UI display */
export interface AppError {
  /** Error message for display */
  message: string;
  /** Error code for programmatic handling */
  code?: string;
  /** Whether the error is recoverable */
  recoverable?: boolean;
}
