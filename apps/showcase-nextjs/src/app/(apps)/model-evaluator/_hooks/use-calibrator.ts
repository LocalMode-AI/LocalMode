/**
 * @file use-calibrator.ts
 * @description Hook for embedding similarity threshold calibration with preset comparison
 */
import { useState } from 'react';
import { useCalibrateThreshold } from '@localmode/react';
import { getDefaultThreshold } from '@localmode/core';
import { getEmbeddingModel } from '../_services/evaluator.service';
import { EMBEDDING_MODELS, SAMPLE_CORPORA, DEFAULT_PERCENTILE } from '../_lib/constants';
import type { AppError } from '../_lib/types';
import type { ThresholdCalibration } from '@localmode/core';

/** Hook for embedding threshold calibration */
export function useCalibrator() {
  const [selectedModelId, setSelectedModelId] = useState(EMBEDDING_MODELS[0].id);
  const [selectedCorpusId, setSelectedCorpusId] = useState(SAMPLE_CORPORA[0].id);

  const model = getEmbeddingModel(selectedModelId);

  const {
    calibration,
    isCalibrating,
    error,
    calibrate,
    cancel,
    clearError,
  } = useCalibrateThreshold({
    model,
    percentile: DEFAULT_PERCENTILE,
  });

  // Compute preset threshold for the selected model
  const presetThreshold = getDefaultThreshold(selectedModelId);

  const runCalibration = async () => {
    const corpus = SAMPLE_CORPORA.find((c) => c.id === selectedCorpusId);
    if (!corpus) return;
    await calibrate(corpus.texts);
  };

  const handleSelectModel = (modelId: string) => {
    setSelectedModelId(modelId);
  };

  const handleSelectCorpus = (corpusId: string) => {
    setSelectedCorpusId(corpusId);
  };

  return {
    selectedModelId,
    setSelectedModelId: handleSelectModel,
    selectedCorpusId,
    setSelectedCorpusId: handleSelectCorpus,
    calibration,
    presetThreshold,
    isCalibrating,
    error: error as AppError | null,
    runCalibration,
    cancel,
    clearError,
  };
}
