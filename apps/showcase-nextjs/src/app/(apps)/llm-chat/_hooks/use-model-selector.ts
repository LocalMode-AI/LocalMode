/**
 * @file use-model-selector.ts
 * @description Hook for managing model selection, loading, and cache operations
 */
'use client';

import { useEffect } from 'react';
import { useModelStore } from '../_store/model.store';
import { useUIStore } from '../_store/ui.store';
import { useChatStore } from '../_store/chat.store';
import {
  getAvailableModels,
  checkModelCached,
  loadModel as loadModelService,
  deleteCache as deleteCacheService,
  detectCapabilities,
} from '../_services/model.service';

/** Options for the useModelSelector hook */
interface UseModelSelectorOptions {
  /** Callback to clear chat messages (owned by useChat hook) */
  clearMessages: () => void;
}

/** Hook for managing model selection and loading */
export function useModelSelector({ clearMessages }: UseModelSelectorOptions) {
  const modelStore = useModelStore();
  const uiStore = useUIStore();
  const chatStore = useChatStore();

  /**
   * Check cache status for all available models
   */
  const checkCacheStatus = async () => {
    modelStore.setLoading(true);
    modelStore.clearError();

    try {
      const availableModels = getAvailableModels();
      const modelsWithCache = await Promise.all(
        availableModels.map(async (model) => ({
          ...model,
          isCached: await checkModelCached(model.id, model.backend),
        }))
      );
      modelStore.setModels(modelsWithCache);
    } catch (error) {
      console.error('Failed to check cache status:', error);
      modelStore.setError({
        message: 'Failed to check model cache status',
        code: 'CACHE_CHECK_FAILED',
        recoverable: true,
      });
      modelStore.setLoading(false);
    }
  };

  // Check cache status and detect capabilities on mount
  useEffect(() => {
    if (modelStore.models.length === 0) {
      checkCacheStatus();
    }

    // Detect WebGPU and CORS isolation once on mount
    detectCapabilities().then(({ webGPUSupported, crossOriginIsolated }) => {
      modelStore.setWebGPUSupported(webGPUSupported);
      modelStore.setCrossOriginIsolated(crossOriginIsolated);
    });
  }, []);

  // Auto-load model if specified
  useEffect(() => {
    const { autoLoadModelId } = uiStore;
    const { models, loadingModelId } = modelStore;

    if (autoLoadModelId && models.length > 0 && !loadingModelId) {
      const modelExists = models.some((m) => m.id === autoLoadModelId);
      if (modelExists) {
        handleLoadModel(autoLoadModelId);
      }
    }
  }, [uiStore.autoLoadModelId, modelStore.models.length, modelStore.loadingModelId]);

  /**
   * Load a model and transition to chat view
   * @param modelId - Model ID to load
   */
  const handleLoadModel = async (modelId: string) => {
    const backend = modelStore.getModelBackend(modelId) ?? 'webgpu';
    chatStore.setSelectedModel(modelId);
    modelStore.setLoadingModel(modelId, 0);
    modelStore.clearError();

    try {
      await loadModelService(modelId, backend, (progress) => {
        modelStore.setLoadProgress(progress);
      });

      // Update cache status
      modelStore.setModelCached(modelId, true);
      modelStore.setLoadingModel(null);

      // Transition to chat
      if (uiStore.appState === 'chat') {
        clearMessages();
      }
      uiStore.setAppState('chat');
      uiStore.setAutoLoadModelId(null);
    } catch (error) {
      console.error('Failed to load model:', error);
      modelStore.setError({
        message: `Failed to load model: ${modelId}`,
        code: 'MODEL_LOAD_FAILED',
        recoverable: true,
      });
      modelStore.setLoadingModel(null);
      // Clear auto-load to prevent infinite retry loop
      uiStore.setAutoLoadModelId(null);
    }
  };

  /**
   * Select a model from the sidebar (triggers model switch)
   * @param modelId - Model ID to select
   */
  const handleSidebarModelSelect = (modelId: string) => {
    chatStore.setSelectedModel(modelId);
    uiStore.setAutoLoadModelId(modelId);
    clearMessages();
    uiStore.setAppState('model-selection');
  };

  /**
   * Delete a model's cache
   * @param modelId - Model ID to delete
   */
  const handleDeleteCache = async (modelId: string) => {
    const backend = modelStore.getModelBackend(modelId) ?? 'webgpu';
    modelStore.setDeletingModelId(modelId);
    modelStore.clearError();

    try {
      await deleteCacheService(modelId, backend);
      modelStore.setModelCached(modelId, false);

      // Clear selection if the deleted model was selected
      if (useChatStore.getState().selectedModel === modelId) {
        chatStore.setSelectedModel('');
        clearMessages();
      }
    } catch (error) {
      console.error('Failed to delete cache:', error);
      modelStore.setError({
        message: `Failed to delete cache for: ${modelId}`,
        code: 'CACHE_DELETE_FAILED',
        recoverable: true,
      });
    } finally {
      modelStore.setDeletingModelId(null);
    }
  };

  return {
    checkCacheStatus,
    handleLoadModel,
    handleSidebarModelSelect,
    handleDeleteCache,
  };
}
