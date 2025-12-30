/**
 * @file model.store.ts
 * @description Zustand store for model state management (pure state, no async)
 */
import { create } from 'zustand';
import type { ModelInfo, ModelCategory, AppError } from '../_lib/types';
import { groupModelsByCategory } from '../_lib/utils';

/** Model store state and actions */
interface ModelState {
  // State
  /** All available models */
  models: ModelInfo[];
  /** Whether cache status is being checked */
  isLoading: boolean;
  /** ID of model currently being loaded */
  loadingModelId: string | null;
  /** Loading progress percentage (0-100) */
  loadProgress: number;
  /** ID of model currently being deleted */
  deletingModelId: string | null;
  /** Current error state */
  error: AppError | null;

  // Actions (pure state setters)
  /** Set the models list */
  setModels: (models: ModelInfo[]) => void;
  /** Set loading state */
  setLoading: (loading: boolean) => void;
  /** Set the loading model ID and progress */
  setLoadingModel: (modelId: string | null, progress?: number) => void;
  /** Set load progress */
  setLoadProgress: (progress: number) => void;
  /** Set the deleting model ID */
  setDeletingModelId: (modelId: string | null) => void;
  /** Update a model's cache status */
  setModelCached: (modelId: string, cached: boolean) => void;
  /** Set error state */
  setError: (error: AppError | null) => void;
  /** Clear error */
  clearError: () => void;

  // Derived state getters (computed on access)
  /** Get models grouped by category */
  getGroupedModels: () => Record<ModelCategory, ModelInfo[]>;
  /** Get count of cached models */
  getCachedCount: () => number;
  /** Get count of available (not cached) models */
  getAvailableCount: () => number;
  /** Get the model currently being loaded */
  getLoadingModel: () => ModelInfo | null;
}

/** Model store - pure state container */
export const useModelStore = create<ModelState>()((set, get) => ({
  // Initial state
  models: [],
  isLoading: true,
  loadingModelId: null,
  loadProgress: 0,
  deletingModelId: null,
  error: null,

  // Pure state setters
  setModels: (models) => set({ models, isLoading: false }),

  setLoading: (isLoading) => set({ isLoading }),

  setLoadingModel: (loadingModelId, progress = 0) =>
    set({ loadingModelId, loadProgress: progress }),

  setLoadProgress: (loadProgress) => set({ loadProgress }),

  setDeletingModelId: (deletingModelId) => set({ deletingModelId }),

  setModelCached: (modelId, cached) =>
    set((state) => ({
      models: state.models.map((m) => (m.id === modelId ? { ...m, isCached: cached } : m)),
    })),

  setError: (error) => set({ error }),

  clearError: () => set({ error: null }),

  // Derived state getters (computed on each access)
  getGroupedModels: () => {
    const { models } = get();
    return groupModelsByCategory(models) as Record<ModelCategory, ModelInfo[]>;
  },

  getCachedCount: () => {
    const { models } = get();
    return models.filter((m) => m.isCached).length;
  },

  getAvailableCount: () => {
    const { models } = get();
    return models.filter((m) => !m.isCached).length;
  },

  getLoadingModel: () => {
    const { loadingModelId, models } = get();
    return loadingModelId ? (models.find((m) => m.id === loadingModelId) ?? null) : null;
  },
}));
