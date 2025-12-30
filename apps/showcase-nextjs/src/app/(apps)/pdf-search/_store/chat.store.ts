/**
 * @file chat.store.ts
 * @description Zustand store for chat message management
 */
import { create } from 'zustand';
import type { ChatMessage, AppError } from '../_lib/types';

/** Chat store state and actions */
interface ChatState {
  // State
  /** All chat messages */
  messages: ChatMessage[];
  /** Whether a response is being generated */
  isSearching: boolean;
  /** Current error state */
  error: AppError | null;

  // Actions
  /** Add a new message */
  addMessage: (message: ChatMessage) => void;
  /** Update an existing message's content */
  updateMessage: (messageId: string, content: string) => void;
  /** Clear all messages */
  clearMessages: () => void;
  /** Set searching state */
  setSearching: (searching: boolean) => void;
  /** Set error state */
  setError: (error: AppError | null) => void;
  /** Clear error */
  clearError: () => void;

  // Derived state getters
  /** Get message count */
  getMessageCount: () => number;
  /** Check if there are any messages */
  hasMessages: () => boolean;
}

/** Chat store - not persisted (messages are session-only) */
export const useChatStore = create<ChatState>()((set, get) => ({
  // Initial state
  messages: [],
  isSearching: false,
  error: null,

  // Actions
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  updateMessage: (messageId, content) =>
    set((state) => ({
      messages: state.messages.map((msg) => (msg.id === messageId ? { ...msg, content } : msg)),
    })),

  clearMessages: () => set({ messages: [] }),

  setSearching: (isSearching) => set({ isSearching }),

  setError: (error) => set({ error }),

  clearError: () => set({ error: null }),

  // Derived state getters
  getMessageCount: () => get().messages.length,

  hasMessages: () => get().messages.length > 0,
}));
