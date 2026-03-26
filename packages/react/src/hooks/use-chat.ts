/**
 * @file use-chat.ts
 * @description Streaming chat hook with message state, persistence, and cancellation
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { UseChatOptions, UseChatReturn, ReactChatMessage, ImageAttachment } from '../core/types.js';
import type { ContentPart } from '@localmode/core';
import {
  loadMessages,
  saveMessages,
  clearMessages as clearPersistedMessages,
} from '../core/chat-persistence.js';

const IS_SERVER = typeof window === 'undefined';
const DEFAULT_PERSIST_KEY = 'localmode-chat-messages';

function createMessage(role: ReactChatMessage['role'], content: string | ContentPart[]): ReactChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: new Date(),
  };
}

/**
 * Build content for a user message, converting ImageAttachments to ContentPart[].
 */
function buildUserContent(text: string, images?: ImageAttachment[]): string | ContentPart[] {
  if (!images || images.length === 0) {
    return text;
  }
  const parts: ContentPart[] = [];
  if (text) {
    parts.push({ type: 'text', text });
  }
  for (const img of images) {
    parts.push({ type: 'image', data: img.data, mimeType: img.mimeType });
  }
  return parts;
}

/**
 * Hook for streaming LLM chat with message history and optional persistence.
 *
 * @param options - Chat configuration including model, system prompt, and persistence
 * @returns Chat state with messages, streaming status, and actions
 *
 * @example
 * ```tsx
 * const { messages, isStreaming, send, cancel } = useChat({
 *   model: webllm.languageModel('Llama-3.2-1B-Instruct-q4f16_1-MLC'),
 *   systemPrompt: 'You are a helpful assistant.',
 * });
 *
 * await send('What is LocalMode?');
 * ```
 */
export function useChat(options: UseChatOptions): UseChatReturn {
  const {
    model,
    systemPrompt: initialSystemPrompt,
    maxTokens,
    temperature,
    persist = true,
    persistKey = DEFAULT_PERSIST_KEY,
    initialMessages,
  } = options;

  const [messages, setMessages] = useState<ReactChatMessage[]>(initialMessages ?? []);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [systemPrompt, setSystemPromptState] = useState(initialSystemPrompt ?? '');

  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const persistInitializedRef = useRef(false);

  // Load persisted messages on mount
  useEffect(() => {
    if (IS_SERVER || !persist || persistInitializedRef.current) return;
    persistInitializedRef.current = true;

    loadMessages(persistKey).then((persisted) => {
      if (persisted && persisted.length > 0 && mountedRef.current) {
        setMessages(persisted);
      }
    });
  }, [persist, persistKey]);

  // Persist messages when they change
  useEffect(() => {
    if (IS_SERVER || !persist || !persistInitializedRef.current) return;
    saveMessages(persistKey, messages);
  }, [messages, persist, persistKey]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const send = useCallback(async (text: string, sendOptions?: { images?: ImageAttachment[] }): Promise<void> => {
    if (IS_SERVER) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const userContent = buildUserContent(text, sendOptions?.images);
    const userMessage = createMessage('user', userContent);
    const assistantMessage = createMessage('assistant', '');

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setError(null);
    setIsStreaming(true);

    try {
      const { streamText } = await import('@localmode/core');

      // Build messages array for the model
      const currentMessages = [...messages, userMessage];
      const coreMessages = currentMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const result = await streamText({
        model,
        prompt: text,
        messages: coreMessages,
        systemPrompt: systemPrompt || undefined,
        maxTokens,
        temperature,
        abortSignal: controller.signal,
      });

      for await (const chunk of result.stream) {
        if (!mountedRef.current || controller.signal.aborted) break;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id ? { ...m, content: (typeof m.content === 'string' ? m.content : '') + chunk.text } : m
          )
        );
      }

      if (mountedRef.current) {
        setIsStreaming(false);
      }
    } catch (err) {
      if (!mountedRef.current) return;

      if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'))) {
        setIsStreaming(false);
        return;
      }

      setError(err instanceof Error ? err : new Error(String(err)));
      setIsStreaming(false);
    }
  }, [messages, model, systemPrompt, maxTokens, temperature]);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const clearMessagesAction = useCallback(() => {
    setMessages([]);
    if (persist) {
      clearPersistedMessages(persistKey);
    }
  }, [persist, persistKey]);

  const setSystemPrompt = useCallback((prompt: string) => {
    setSystemPromptState(prompt);
  }, []);

  if (IS_SERVER) {
    return {
      messages: initialMessages ?? [],
      isStreaming: false,
      error: null,
      send: async () => {},
      cancel: () => {},
      clearMessages: () => {},
      setSystemPrompt: () => {},
    };
  }

  return {
    messages,
    isStreaming,
    error,
    send,
    cancel,
    clearMessages: clearMessagesAction,
    setSystemPrompt,
  };
}
