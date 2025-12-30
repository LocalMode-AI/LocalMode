/**
 * @file ui.store.ts
 * @description Zustand store for UI state management
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppState } from '../_lib/types';
import { STORAGE_KEYS } from '../_lib/constants';

/** UI store state and actions */
interface UIState {
  // App state
  /** Current application state (model-selection or chat) */
  appState: AppState;
  /** Whether the sidebar is open */
  isSidebarOpen: boolean;
  /** Model ID to auto-load when entering model selection */
  autoLoadModelId: string | null;

  // Chat input state
  /** Current input value */
  input: string;
  /** Whether a message is being sent */
  isSending: boolean;

  // Actions
  /** Set the application state */
  setAppState: (state: AppState) => void;
  /** Toggle sidebar visibility */
  toggleSidebar: () => void;
  /** Set the model ID to auto-load */
  setAutoLoadModelId: (modelId: string | null) => void;

  // Input actions
  /** Set the input value */
  setInput: (input: string) => void;
  /** Set sending state */
  setSending: (sending: boolean) => void;
  /** Clear the input */
  clearInput: () => void;
}

/** UI store with persistence */
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Initial state
      appState: 'chat',
      isSidebarOpen: true,
      autoLoadModelId: null,
      input: '',
      isSending: false,

      // Actions
      setAppState: (appState) => set({ appState }),

      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

      setAutoLoadModelId: (autoLoadModelId) => set({ autoLoadModelId }),

      // Input actions
      setInput: (input) => set({ input }),

      setSending: (isSending) => set({ isSending }),

      clearInput: () => set({ input: '' }),
    }),
    {
      name: STORAGE_KEYS.ui,
      partialize: (state) => ({
        // Only persist sidebar state
        isSidebarOpen: state.isSidebarOpen,
      }),
    }
  )
);
