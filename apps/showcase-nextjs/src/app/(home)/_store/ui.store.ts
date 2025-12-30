/**
 * @file ui.store.ts
 * @description Zustand store for UI state management
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Storage key for UI persistence */
const STORAGE_KEY = 'localmode-home-ui';

/** UI store state and actions */
interface UIState {
  // UI State
  /** Whether the sidebar is open */
  sidebarOpen: boolean;
  /** Toggle sidebar visibility */
  toggleSidebar: () => void;
  /** Set sidebar open state */
  setSidebarOpen: (open: boolean) => void;

  // Navigation
  /** Current route */
  currentRoute: string;
  /** Set current route */
  setCurrentRoute: (route: string) => void;
}

/** UI store with persistence */
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Initial state
      sidebarOpen: true,
      currentRoute: '/',

      // Actions
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setCurrentRoute: (route) => set({ currentRoute: route }),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
);
