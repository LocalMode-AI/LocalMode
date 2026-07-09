/**
 * @file use-chat.ts
 * @description Streaming chat hook with message state, persistence, cancellation,
 * usage tracking, lifecycle status, and per-turn reply variants (regenerate)
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { UseChatOptions, UseChatReturn, ReactChatMessage, ImageAttachment, ChatStatus } from '../core/types.js';
import type { ContentPart, GenerationUsage } from '@localmode/core';
import {
  loadMessages,
  saveMessages,
  clearMessages as clearPersistedMessages,
} from '../core/chat-persistence.js';

const IS_SERVER = typeof window === 'undefined';
const DEFAULT_PERSIST_KEY = 'localmode-chat-messages';

/** Zero-valued usage used as the initial cumulative total */
const EMPTY_USAGE: GenerationUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  durationMs: 0,
};

/** Sum two usage records field-by-field */
function addUsage(a: GenerationUsage, b: GenerationUsage): GenerationUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    durationMs: a.durationMs + b.durationMs,
  };
}

function createMessage(role: ReactChatMessage['role'], content: string | ContentPart[]): ReactChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: new Date(),
  };
}

/** Extract plain text from message content (text parts only for multimodal content) */
function getTextContent(content: string | ContentPart[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((part): part is Extract<ContentPart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

/** Find the index of the last message with the given role (-1 when absent) */
function findLastIndexByRole(messages: ReactChatMessage[], role: ReactChatMessage['role']): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === role) return i;
  }
  return -1;
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
 * Tracks per-turn and cumulative token usage, exposes a lifecycle `status`
 * (`ready` → `submitted` → `streaming` → `ready`), and supports regenerating
 * the last assistant reply into selectable variants for Branch-style UIs.
 *
 * @param options - Chat configuration including model, system prompt, and persistence
 * @returns Chat state with messages, streaming status, usage, variants, and actions
 *
 * @example
 * ```tsx
 * const { messages, status, usage, send, regenerate, variants, setVariantIndex } = useChat({
 *   model: webllm.languageModel('Llama-3.2-1B-Instruct-q4f16_1-MLC'),
 *   systemPrompt: 'You are a helpful assistant.',
 * });
 *
 * await send('What is LocalMode?');
 * await regenerate(); // second variant of the same turn
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
  const [status, setStatus] = useState<ChatStatus>('ready');
  const [error, setError] = useState<Error | null>(null);
  const [systemPrompt, setSystemPromptState] = useState(initialSystemPrompt ?? '');
  const [usage, setUsage] = useState<GenerationUsage | null>(null);
  const [totalUsage, setTotalUsage] = useState<GenerationUsage>(EMPTY_USAGE);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  // Frozen variant texts for the last assistant turn. Empty until the first
  // regeneration; index 0 then holds the original reply text.
  const [variantTexts, setVariantTexts] = useState<string[]>([]);
  const [variantIndex, setVariantIndexState] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const persistInitializedRef = useRef(false);

  // `isStreaming` is derived from status to preserve the original field unchanged
  const isStreaming = status === 'submitted' || status === 'streaming';

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

  /** Record a completed turn's usage (last turn + cumulative total) */
  const recordUsage = useCallback((turnUsage: GenerationUsage) => {
    setUsage(turnUsage);
    setTotalUsage((prev) => addUsage(prev, turnUsage));
  }, []);

  const send = useCallback(async (text: string, sendOptions?: { images?: ImageAttachment[]; providerOptions?: Record<string, Record<string, unknown>> }): Promise<void> => {
    if (IS_SERVER) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const userContent = buildUserContent(text, sendOptions?.images);
    const userMessage = createMessage('user', userContent);
    const assistantMessage = createMessage('assistant', '');

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setError(null);
    setStatus('submitted');
    setStreamingMessageId(assistantMessage.id);
    // A new turn resets the variants of the previous turn
    setVariantTexts([]);
    setVariantIndexState(0);

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
        ...(sendOptions?.providerOptions ? { providerOptions: sendOptions.providerOptions } : {}),
      });

      // The text/usage promises reject when the stream aborts before
      // completion; mark them handled to avoid unhandled rejections.
      result.text.catch(() => {});
      result.usage.catch(() => {});

      let receivedFirstChunk = false;
      for await (const chunk of result.stream) {
        if (!mountedRef.current || controller.signal.aborted) break;
        if (!receivedFirstChunk) {
          receivedFirstChunk = true;
          setStatus('streaming');
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id ? { ...m, content: (typeof m.content === 'string' ? m.content : '') + chunk.text } : m
          )
        );
      }

      if (!mountedRef.current) return;

      if (!controller.signal.aborted) {
        // The stream completed, so the usage promise is already settled
        const turnUsage = await result.usage;
        if (mountedRef.current && !controller.signal.aborted) {
          recordUsage(turnUsage);
        }
      }

      if (mountedRef.current && abortControllerRef.current === controller) {
        setStatus('ready');
        setStreamingMessageId(null);
      }
    } catch (err) {
      if (!mountedRef.current) return;

      if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'))) {
        if (abortControllerRef.current === controller) {
          setStatus('ready');
          setStreamingMessageId(null);
        }
        return;
      }

      setError(err instanceof Error ? err : new Error(String(err)));
      if (abortControllerRef.current === controller) {
        setStatus('error');
        setStreamingMessageId(null);
      }
    }
  }, [messages, model, systemPrompt, maxTokens, temperature, recordUsage]);

  const regenerate = useCallback(async (): Promise<void> => {
    if (IS_SERVER) return;

    const lastAssistantIdx = findLastIndexByRole(messages, 'assistant');
    const lastUserIdx = findLastIndexByRole(messages, 'user');
    if (lastAssistantIdx === -1 || lastUserIdx === -1) return;

    const lastAssistantMsg = messages[lastAssistantIdx];
    const lastUserMsg = messages[lastUserIdx];
    // Preserved for restoring the message if the regeneration is cancelled
    const previousActiveContent = lastAssistantMsg.content;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Freeze the original reply as variants[0] on the first regeneration of this turn
    const baseVariants = variantTexts.length > 0 ? variantTexts : [getTextContent(lastAssistantMsg.content)];
    setVariantTexts(baseVariants);
    setError(null);
    setStatus('submitted');
    setStreamingMessageId(lastAssistantMsg.id);

    try {
      const { streamText } = await import('@localmode/core');

      // Same prior-context messages as the original turn — everything before
      // the last assistant reply. No new messages are appended.
      const priorMessages = messages.slice(0, lastAssistantIdx).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const result = await streamText({
        model,
        prompt: getTextContent(lastUserMsg.content),
        messages: priorMessages,
        systemPrompt: systemPrompt || undefined,
        maxTokens,
        temperature,
        abortSignal: controller.signal,
      });

      // The text/usage promises reject when the stream aborts before
      // completion; mark them handled to avoid unhandled rejections.
      result.text.catch(() => {});
      result.usage.catch(() => {});

      let accumulated = '';
      let receivedFirstChunk = false;
      for await (const chunk of result.stream) {
        if (!mountedRef.current || controller.signal.aborted) break;
        if (!receivedFirstChunk) {
          receivedFirstChunk = true;
          setStatus('streaming');
        }
        accumulated += chunk.text;
        const liveText = accumulated;
        setMessages((prev) =>
          prev.map((m) => (m.id === lastAssistantMsg.id ? { ...m, content: liveText } : m))
        );
      }

      if (!mountedRef.current) return;

      if (controller.signal.aborted) {
        // Cancelled mid-regeneration — restore the previously active variant
        setMessages((prev) =>
          prev.map((m) => (m.id === lastAssistantMsg.id ? { ...m, content: previousActiveContent } : m))
        );
        if (abortControllerRef.current === controller) {
          setStatus('ready');
          setStreamingMessageId(null);
        }
        return;
      }

      // The stream completed, so the usage promise is already settled
      const turnUsage = await result.usage;
      if (!mountedRef.current || controller.signal.aborted) return;
      recordUsage(turnUsage);

      const nextVariants = [...baseVariants, accumulated];
      setVariantTexts(nextVariants);
      setVariantIndexState(nextVariants.length - 1);
      if (abortControllerRef.current === controller) {
        setStatus('ready');
        setStreamingMessageId(null);
      }
    } catch (err) {
      if (!mountedRef.current) return;

      // Restore the previously active variant on failure or cancellation
      setMessages((prev) =>
        prev.map((m) => (m.id === lastAssistantMsg.id ? { ...m, content: previousActiveContent } : m))
      );

      if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'))) {
        if (abortControllerRef.current === controller) {
          setStatus('ready');
          setStreamingMessageId(null);
        }
        return;
      }

      setError(err instanceof Error ? err : new Error(String(err)));
      if (abortControllerRef.current === controller) {
        setStatus('error');
        setStreamingMessageId(null);
      }
    }
  }, [messages, model, systemPrompt, maxTokens, temperature, variantTexts, recordUsage]);

  const setVariantIndexAction = useCallback((index: number) => {
    const lastAssistantIdx = findLastIndexByRole(messages, 'assistant');
    if (lastAssistantIdx === -1) return;

    const lastAssistantMsg = messages[lastAssistantIdx];
    const texts = variantTexts.length > 0 ? variantTexts : [getTextContent(lastAssistantMsg.content)];
    const clamped = Math.max(0, Math.min(index, texts.length - 1));

    setVariantIndexState(clamped);
    // Reflect the active variant as the last assistant message's content so
    // existing consumers render it with zero changes (and it persists).
    setMessages((prev) =>
      prev.map((m) => (m.id === lastAssistantMsg.id ? { ...m, content: texts[clamped] } : m))
    );
  }, [messages, variantTexts]);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const clearMessagesAction = useCallback(() => {
    setMessages([]);
    setVariantTexts([]);
    setVariantIndexState(0);
    if (persist) {
      clearPersistedMessages(persistKey);
    }
  }, [persist, persistKey]);

  const setMessagesAction = useCallback((next: ReactChatMessage[]) => {
    setMessages(next);
    // The conversation was replaced — variants belong to the previous turn
    setVariantTexts([]);
    setVariantIndexState(0);
    // The persistence effect saves the new state when persistence is enabled
  }, []);

  const setSystemPrompt = useCallback((prompt: string) => {
    setSystemPromptState(prompt);
  }, []);

  // Derived variants for the last assistant turn: before any regeneration the
  // single variant mirrors the live last assistant message (kept in sync as it
  // streams or changes); after a regeneration the frozen texts are used.
  const lastAssistantIdx = findLastIndexByRole(messages, 'assistant');
  const variants = lastAssistantIdx === -1
    ? []
    : variantTexts.length > 0
      ? variantTexts
      : [getTextContent(messages[lastAssistantIdx].content)];

  if (IS_SERVER) {
    return {
      messages: initialMessages ?? [],
      isStreaming: false,
      error: null,
      usage: null,
      totalUsage: EMPTY_USAGE,
      status: 'ready',
      streamingMessageId: null,
      variants: [],
      variantIndex: 0,
      send: async () => {},
      cancel: () => {},
      clearMessages: () => {},
      setMessages: () => {},
      setSystemPrompt: () => {},
      regenerate: async () => {},
      setVariantIndex: () => {},
    };
  }

  return {
    messages,
    isStreaming,
    error,
    usage,
    totalUsage,
    status,
    streamingMessageId,
    variants,
    variantIndex,
    send,
    cancel,
    clearMessages: clearMessagesAction,
    setMessages: setMessagesAction,
    setSystemPrompt,
    regenerate,
    setVariantIndex: setVariantIndexAction,
  };
}
