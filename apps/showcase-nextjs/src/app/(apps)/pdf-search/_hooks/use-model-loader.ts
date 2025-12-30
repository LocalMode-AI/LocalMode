/**
 * @file use-model-loader.ts
 * @description Hook for loading and managing ML models
 */
'use client';

import { useEffect, useState } from 'react';
import { useUIStore } from '../_store/ui.store';
import { loadRequiredModels } from '../_services/model.service';
import { initializeEmbeddingModel, isEmbeddingModelReady } from '../_services/pdf.service';

/** Hook for model loading and status */
export function useModelLoader() {
  const uiStore = useUIStore();
  const [error, setError] = useState<string | null>(null);

  /**
   * Load and initialize all required models
   */
  const loadModels = async () => {
    uiStore.setModelsReady(false);
    setError(null);

    try {
      // Step 1: Download model files (preload)
      uiStore.setModelLoading('Downloading models', 0);
      await loadRequiredModels(uiStore.useReranking, (modelName, progress) => {
        uiStore.setModelLoading(`Downloading ${modelName}`, progress);
      });

      // Step 2: Initialize the embedding model pipeline
      uiStore.setModelLoading('Initializing embedding model', 0);
      await initializeEmbeddingModel();

      uiStore.setModelLoading(null, 0);
      uiStore.setModelsReady(true);
    } catch (err) {
      console.error('Model loading error:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to load models: ${message}`);
      uiStore.setModelLoading(null, 0);
      uiStore.setModelsReady(false);
    }
  };

  // Initialize models on mount
  useEffect(() => {
    // Check if already ready
    if (isEmbeddingModelReady()) {
      uiStore.setModelsReady(true);
      return;
    }

    loadModels();
  }, []);

  // Reload reranker when useReranking changes
  useEffect(() => {
    if (uiStore.modelsReady && uiStore.useReranking) {
      // Reranking was just enabled, load reranker
      loadModels();
    }
  }, [uiStore.useReranking]);

  return {
    isReady: uiStore.modelsReady,
    isLoading: uiStore.loadingModelName !== null,
    loadingModelName: uiStore.loadingModelName,
    loadingProgress: uiStore.loadingProgress,
    error,
    loadModels,
  };
}
