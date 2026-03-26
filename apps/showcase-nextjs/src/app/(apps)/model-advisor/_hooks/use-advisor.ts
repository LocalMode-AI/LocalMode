/**
 * @file use-advisor.ts
 * @description Main hook for the model advisor application.
 * Manages task selection, model recommendations, batch size, and custom model registration.
 */
import { useState } from 'react';
import { useModelRecommendations, useAdaptiveBatchSize } from '@localmode/react';
import { registerCustomModel } from '../_services/advisor.service';
import { DEFAULT_TASK, DEFAULT_DIMENSIONS, BATCH_TASK_MAP } from '../_lib/constants';
import type { TaskCategory, CustomModelFormData } from '../_lib/types';
import type { ModelRegistryEntry } from '@localmode/core';

/** Hook for managing model advisor state and operations */
export function useAdvisor() {
  const [selectedTask, setSelectedTask] = useState<TaskCategory>(DEFAULT_TASK);
  const [isRegisterModalOpen, setRegisterModalOpen] = useState(false);

  // Get model recommendations based on device capabilities and selected task
  const { recommendations, capabilities, isLoading, error, refresh } =
    useModelRecommendations({ task: selectedTask });

  // Compute optimal batch size for the selected task
  const batchSize = useAdaptiveBatchSize({
    taskType: BATCH_TASK_MAP[selectedTask],
    modelDimensions: DEFAULT_DIMENSIONS,
  });

  /** Register a custom model and refresh recommendations */
  const handleRegisterModel = (data: CustomModelFormData) => {
    const entry: ModelRegistryEntry = {
      modelId: data.modelId,
      name: data.name,
      provider: data.provider,
      task: data.task,
      sizeMB: data.sizeMB,
      minMemoryMB: data.minMemoryMB,
      dimensions: data.dimensions,
      recommendedDevice: data.recommendedDevice,
      speedTier: data.speedTier,
      qualityTier: data.qualityTier,
      description: data.description,
    };
    registerCustomModel(entry);
    refresh();
    setRegisterModalOpen(false);
  };

  return {
    selectedTask,
    setSelectedTask,
    recommendations,
    capabilities,
    isLoading,
    error,
    refresh,
    batchSize,
    isRegisterModalOpen,
    openRegisterModal: () => setRegisterModalOpen(true),
    closeRegisterModal: () => setRegisterModalOpen(false),
    registerModel: handleRegisterModel,
  };
}
