/**
 * @file use-evaluator.ts
 * @description Hook for classification model evaluation with metrics and confusion matrix
 */
import { useState } from 'react';
import { useEvaluateModel } from '@localmode/react';
import {
  classify,
  accuracy,
  precision,
  recall,
  f1Score,
  confusionMatrix,
} from '@localmode/core';
import { toAppError } from '@localmode/react';
import { getClassifierModel } from '../_services/evaluator.service';
import { CLASSIFIER_MODELS, SAMPLE_DATASETS } from '../_lib/constants';
import type { EvaluationResults, EvaluationProgress, AppError } from '../_lib/types';

/** Hook for classification model evaluation */
export function useEvaluator() {
  const [selectedModelId, setSelectedModelId] = useState(CLASSIFIER_MODELS[0].id);
  const [selectedDatasetId, setSelectedDatasetId] = useState(SAMPLE_DATASETS[0].id);
  const [results, setResults] = useState<EvaluationResults | null>(null);
  const [progress, setProgress] = useState<EvaluationProgress | null>(null);

  const { isLoading, error, execute, cancel, reset } = useEvaluateModel<string, string>();

  const runEvaluation = async () => {
    const dataset = SAMPLE_DATASETS.find((d) => d.id === selectedDatasetId);
    if (!dataset) return;

    const model = getClassifierModel(selectedModelId);
    const inputs = dataset.entries.map((e) => e.input);
    const expected = dataset.entries.map((e) => e.expected);

    // Reset previous results and progress
    setResults(null);
    setProgress({ completed: 0, total: inputs.length });

    const evalResult = await execute({
      dataset: { inputs, expected },
      predict: async (text: string, signal: AbortSignal) => {
        const result = await classify({ model, text, abortSignal: signal });
        return result.label;
      },
      metric: accuracy,
      onProgress: (completed: number, total: number) => {
        setProgress({ completed, total });
      },
    });

    if (evalResult) {
      // Compute additional metrics from predictions
      const preds = evalResult.predictions;
      const metricsResult = {
        accuracy: evalResult.score,
        precision: precision(preds, expected),
        recall: recall(preds, expected),
        f1: f1Score(preds, expected),
      };
      const cm = confusionMatrix(preds, expected);

      setResults({
        metrics: metricsResult,
        predictions: preds,
        expected,
        confusionMatrix: cm,
        datasetSize: evalResult.datasetSize,
        durationMs: evalResult.durationMs,
        modelId: selectedModelId,
        datasetName: dataset.name,
      });
    }

    // Clear progress when done
    setProgress(null);
  };

  const clearResults = () => {
    setResults(null);
    setProgress(null);
    reset();
  };

  const handleSelectModel = (modelId: string) => {
    setSelectedModelId(modelId);
    setResults(null);
    setProgress(null);
  };

  const handleSelectDataset = (datasetId: string) => {
    setSelectedDatasetId(datasetId);
    setResults(null);
    setProgress(null);
  };

  return {
    selectedModelId,
    setSelectedModelId: handleSelectModel,
    selectedDatasetId,
    setSelectedDatasetId: handleSelectDataset,
    results,
    progress,
    isEvaluating: isLoading,
    error: toAppError(error) as AppError | null,
    runEvaluation,
    cancel,
    clearResults,
    clearError: reset,
  };
}
