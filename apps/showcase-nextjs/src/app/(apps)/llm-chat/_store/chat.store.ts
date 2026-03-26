/**
 * @file chat.store.ts
 * @description Zustand store for shared UI state in the chat app.
 *
 * Only contains UI-owned state shared across components (selected model,
 * system prompt). ML state (messages, streaming) is owned by `useChat`
 * from `@localmode/react` and read directly via hook returns / props.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_SYSTEM_PROMPT, STORAGE_KEYS } from '../_lib/constants';

/** Chat store state and actions */
interface ChatState {
  /** Currently selected model ID */
  selectedModel: string;
  /** System prompt for the conversation */
  systemPrompt: string;
  /** Whether the semantic cache is enabled */
  cacheEnabled: boolean;
  /** Whether agent mode is enabled */
  agentEnabled: boolean;

  /** Set the selected model */
  setSelectedModel: (model: string) => void;
  /** Set the system prompt */
  setSystemPrompt: (prompt: string) => void;
  /** Set the cache enabled state */
  setCacheEnabled: (enabled: boolean) => void;
  /** Set the agent mode enabled state */
  setAgentEnabled: (enabled: boolean) => void;
}

/** Chat store with persistence */
export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      selectedModel: '',
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      cacheEnabled: false,
      agentEnabled: false,

      setSelectedModel: (model) => set({ selectedModel: model }),
      setSystemPrompt: (prompt) => set({ systemPrompt: prompt }),
      setCacheEnabled: (enabled) => set({ cacheEnabled: enabled }),
      setAgentEnabled: (enabled) => set({ agentEnabled: enabled }),
    }),
    {
      name: STORAGE_KEYS.chat,
      partialize: (state) => ({
        selectedModel: state.selectedModel,
        systemPrompt: state.systemPrompt,
        cacheEnabled: state.cacheEnabled,
        agentEnabled: state.agentEnabled,
      }),
    }
  )
);
