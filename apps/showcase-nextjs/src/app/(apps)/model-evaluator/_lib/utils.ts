/**
 * @file utils.ts
 * @description Utility functions for the model evaluator application
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { EvaluationResults } from './types';

/** Merges Tailwind CSS classes with proper precedence */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a 0-1 score as a percentage string (e.g., 0.833 -> "83.3%") */
export function formatScore(score: number) {
  return `${(score * 100).toFixed(1)}%`;
}

/** Format milliseconds to human-readable duration (e.g., 4200 -> "4.2s") */
export function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Format a number to N decimal places (default 4) */
export function formatDecimal(value: number, decimals = 4) {
  return value.toFixed(decimals);
}

/** Build the JSON export payload from evaluation results */
export function buildExportPayload(results: EvaluationResults) {
  return {
    modelId: results.modelId,
    datasetName: results.datasetName,
    datasetSize: results.datasetSize,
    durationMs: results.durationMs,
    metrics: {
      accuracy: results.metrics.accuracy,
      precision: results.metrics.precision,
      recall: results.metrics.recall,
      f1: results.metrics.f1,
    },
    predictions: results.predictions,
    expected: results.expected,
  };
}

/** Trigger a JSON download via a temporary anchor element */
export function downloadJson(data: object, filename: string) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Get Tailwind background color class for a confusion matrix cell.
 * Diagonal cells (correct predictions) use green/success tones,
 * off-diagonal cells (errors) use red/error tones.
 * Intensity is proportional to count relative to max.
 */
export function getCellColor(count: number, maxCount: number, isDiagonal: boolean) {
  if (count === 0 || maxCount === 0) return 'bg-base-200/30';

  const intensity = count / maxCount;
  const base = isDiagonal ? 'bg-success' : 'bg-error';

  if (intensity > 0.75) return `${base}/80`;
  if (intensity > 0.5) return `${base}/60`;
  if (intensity > 0.25) return `${base}/40`;
  return `${base}/20`;
}
