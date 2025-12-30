/**
 * @file chat.store.ts
 * @description Zustand store for chat state management
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChatMessage } from '../_lib/types';
import { DEFAULT_SYSTEM_PROMPT, STORAGE_KEYS } from '../_lib/constants';

/** Chat store state and actions */
interface ChatState {
  // State
  /** All chat messages */
  messages: ChatMessage[];
  /** Whether the model is currently streaming a response */
  isStreaming: boolean;
  /** ID of the message currently being streamed */
  streamingMessageId: string | null;
  /** Currently selected model ID */
  selectedModel: string;
  /** System prompt for the conversation */
  systemPrompt: string;
  /** AbortController for current streaming request */
  abortController: AbortController | null;

  // Actions
  /** Add a new message to the chat */
  addMessage: (message: ChatMessage) => void;
  /** Update an existing message's content */
  updateMessage: (messageId: string, content: string) => void;
  /** Append text to an existing message's content */
  appendToMessage: (messageId: string, text: string) => void;
  /** Clear all messages */
  clearMessages: () => void;
  /** Set streaming state with optional abort controller */
  setStreaming: (streaming: boolean, abortController?: AbortController | null) => void;
  /** Set the ID of the message being streamed */
  setStreamingMessageId: (messageId: string | null) => void;
  /** Set the selected model */
  setSelectedModel: (model: string) => void;
  /** Set the system prompt */
  setSystemPrompt: (prompt: string) => void;
  /** Abort current streaming request */
  abortStreaming: () => void;
}

/** Chat store with persistence */
export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      // Initial state
      messages: [],
      isStreaming: false,
      streamingMessageId: null,
      selectedModel: '',
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      abortController: null,

      // Actions
      addMessage: (message) =>
        set((state) => ({
          messages: [...state.messages, message],
        })),

      updateMessage: (messageId, content) =>
        set((state) => ({
          messages: state.messages.map((msg) => (msg.id === messageId ? { ...msg, content } : msg)),
        })),

      appendToMessage: (messageId, text) =>
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === messageId ? { ...msg, content: msg.content + text } : msg
          ),
        })),

      clearMessages: () => {
        get().abortStreaming();
        set({ messages: [] });
      },

      setStreaming: (streaming, abortController = null) =>
        set({
          isStreaming: streaming,
          abortController: streaming ? abortController : null,
        }),

      setStreamingMessageId: (messageId) => set({ streamingMessageId: messageId }),

      setSelectedModel: (model) => set({ selectedModel: model }),

      setSystemPrompt: (prompt) => set({ systemPrompt: prompt }),

      abortStreaming: () => {
        const { abortController } = get();
        if (abortController) {
          abortController.abort();
          set({ isStreaming: false, abortController: null, streamingMessageId: null });
        }
      },
    }),
    {
      name: STORAGE_KEYS.chat,
      partialize: (state) => ({
        // Only persist model selection and system prompt
        selectedModel: state.selectedModel,
        systemPrompt: state.systemPrompt,
      }),
    }
  )
);
