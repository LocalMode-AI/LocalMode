/**
 * @file vault.store.ts
 * @description Zustand store for vault state management
 */
import { create } from 'zustand';
import type { VaultEntry, VaultState, AppError } from '../_lib/types';

/** Vault store state and actions */
interface VaultStoreState {
  // State
  /** Current vault state (locked, unlocked, or setup) */
  vaultState: VaultState;
  /** All vault entries */
  entries: VaultEntry[];
  /** Currently decrypted entry ID */
  decryptedEntryId: string | null;
  /** Decrypted content for the currently viewed entry */
  decryptedContent: string | null;
  /** Whether an operation is in progress */
  isProcessing: boolean;
  /** Current error state */
  error: AppError | null;

  // Actions
  /** Set the vault state */
  setVaultState: (state: VaultState) => void;
  /** Set vault entries */
  setEntries: (entries: VaultEntry[]) => void;
  /** Add an entry */
  addEntry: (entry: VaultEntry) => void;
  /** Remove an entry by ID */
  removeEntry: (id: string) => void;
  /** Set the decrypted entry and content */
  setDecrypted: (entryId: string | null, content: string | null) => void;
  /** Set processing state */
  setProcessing: (processing: boolean) => void;
  /** Set error state */
  setError: (error: AppError | null) => void;
  /** Clear error */
  clearError: () => void;
  /** Reset store to locked state */
  reset: () => void;

  // Derived state getters
  /** Get the total number of entries */
  getEntryCount: () => number;
}

/** Vault store - pure state container */
export const useVaultStore = create<VaultStoreState>()((set, get) => ({
  // Initial state
  vaultState: 'setup',
  entries: [],
  decryptedEntryId: null,
  decryptedContent: null,
  isProcessing: false,
  error: null,

  // Actions
  setVaultState: (vaultState) => set({ vaultState }),

  setEntries: (entries) => set({ entries }),

  addEntry: (entry) =>
    set((state) => ({
      entries: [...state.entries, entry],
    })),

  removeEntry: (id) =>
    set((state) => ({
      entries: state.entries.filter((e) => e.id !== id),
      // Clear decrypted view if this entry was being viewed
      decryptedEntryId: state.decryptedEntryId === id ? null : state.decryptedEntryId,
      decryptedContent: state.decryptedEntryId === id ? null : state.decryptedContent,
    })),

  setDecrypted: (entryId, content) =>
    set({
      decryptedEntryId: entryId,
      decryptedContent: content,
    }),

  setProcessing: (isProcessing) => set({ isProcessing }),

  setError: (error) => set({ error }),

  clearError: () => set({ error: null }),

  reset: () =>
    set({
      vaultState: 'locked',
      entries: [],
      decryptedEntryId: null,
      decryptedContent: null,
      isProcessing: false,
      error: null,
    }),

  // Derived state getters
  getEntryCount: () => get().entries.length,
}));
