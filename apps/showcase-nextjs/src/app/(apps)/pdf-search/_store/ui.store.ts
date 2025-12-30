/**
 * @file ui.store.ts
 * @description Zustand store for UI state management
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS, SEARCH_CONFIG } from '../_lib/constants';

/** UI store state and actions */
interface UIState {
  // Sidebar state
  /** Whether the sidebar is open */
  isSidebarOpen: boolean;

  // Search settings
  /** Number of results to return */
  topK: number;
  /** Whether to use reranking */
  useReranking: boolean;

  // Model loading state
  /** Whether models are loaded */
  modelsReady: boolean;
  /** Currently loading model name */
  loadingModelName: string | null;
  /** Loading progress (0-100) */
  loadingProgress: number;

  // Chat input state
  /** Current input value */
  input: string;

  // Actions
  /** Toggle sidebar visibility */
  toggleSidebar: () => void;
  /** Set sidebar open state */
  setSidebarOpen: (open: boolean) => void;
  /** Set top K value */
  setTopK: (k: number) => void;
  /** Set use reranking */
  setUseReranking: (use: boolean) => void;
  /** Set models ready state */
  setModelsReady: (ready: boolean) => void;
  /** Set model loading state */
  setModelLoading: (modelName: string | null, progress: number) => void;
  /** Set the input value */
  setInput: (input: string) => void;
  /** Clear the input */
  clearInput: () => void;
}

/** UI store with persistence for settings */
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Initial state
      isSidebarOpen: true,
      topK: SEARCH_CONFIG.defaultTopK,
      useReranking: true,
      modelsReady: false,
      loadingModelName: null,
      loadingProgress: 0,
      input: '',

      // Actions
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

      setSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),

      setTopK: (topK) => set({ topK }),

      setUseReranking: (useReranking) => set({ useReranking }),

      setModelsReady: (modelsReady) =>
        set({ modelsReady, loadingModelName: null, loadingProgress: 0 }),

      setModelLoading: (loadingModelName, loadingProgress) =>
        set({ loadingModelName, loadingProgress }),

      setInput: (input) => set({ input }),

      clearInput: () => set({ input: '' }),
    }),
    {
      name: STORAGE_KEYS.ui,
      partialize: (state) => ({
        // Only persist settings
        isSidebarOpen: state.isSidebarOpen,
        topK: state.topK,
        useReranking: state.useReranking,
      }),
    }
  )
);
