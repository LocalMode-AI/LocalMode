/**
 * @file use-chat.ts
 * @description Hook for chat interactions using @localmode/react.
 *
 * Returns messages, streaming state, cache state, and actions directly — no Zustand bridge.
 * Components read ML state from hook returns (via props from ChatView).
 *
 * When the semantic cache is enabled, wraps the LanguageModel with
 * `semanticCacheMiddleware` and listens for `cacheHit` events on
 * `globalEventBus` to annotate cached messages.
 *
 * When agent mode is enabled, delegates to useAgentChat for message handling
 * instead of the regular useReactChat flow.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { useChat as useReactChat, downloadBlob } from '@localmode/react';
import { globalEventBus } from '@localmode/core';
import type { SemanticCache } from '@localmode/core';
import { useChatStore } from '../_store/chat.store';
import { useModelStore } from '../_store/model.store';
import {
  createChatModel,
  inferBackendFromModelId,
  createSemanticCacheInstance,
  createCachedModel,
} from '../_services/chat.service';
import { CHAT_CONFIG, STORAGE_KEYS } from '../_lib/constants';
import { useAgentChat } from './use-agent-chat';
import type { ChatMessage, ChatImageAttachment, CacheStats } from '../_lib/types';

/** Hook for chat interactions — returns all ML state directly */
export function useChat() {
  const selectedModel = useChatStore((s) => s.selectedModel);
  const systemPrompt = useChatStore((s) => s.systemPrompt);
  const cacheEnabled = useChatStore((s) => s.cacheEnabled);
  const agentEnabled = useChatStore((s) => s.agentEnabled);

  // Always call useAgentChat (rules of hooks) — only use its return when agent mode is on
  const agentChat = useAgentChat();

  // Track agent mode changes to clear messages when toggling
  const prevAgentEnabled = useRef(agentEnabled);

  // Cache state
  const cacheRef = useRef<SemanticCache | null>(null);
  const [isCacheLoading, setIsCacheLoading] = useState(false);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);

  // Map of assistant message IDs to cache metadata (persists across renders)
  const cachedMessageMap = useRef<Map<string, number>>(new Map());

  // Flag set by globalEventBus cacheHit listener, consumed after send()
  const pendingCacheHit = useRef(false);
  const sendStartTime = useRef(0);

  // Create the base language model instance — only when the model ID changes
  const baseModelRef = useRef<ReturnType<typeof createChatModel> | null>(null);
  const prevModelId = useRef<string>('');

  // Track the effective model (base or cache-wrapped)
  const modelRef = useRef<ReturnType<typeof createChatModel> | null>(null);

  // Update base model when selectedModel changes
  if (selectedModel && selectedModel !== prevModelId.current) {
    // Use store backend if available, otherwise infer from model ID (handles page reload before store loads)
    const backend = useModelStore.getState().getModelBackend(selectedModel) ?? inferBackendFromModelId(selectedModel);
    baseModelRef.current = createChatModel(selectedModel, backend);
    prevModelId.current = selectedModel;

    // Clear cache entries when model changes (responses are model-specific)
    if (cacheRef.current) {
      cacheRef.current.clear().catch(() => {});
    }

    // Default to base model; cache wrapping happens in the effect below
    modelRef.current = baseModelRef.current;
  }

  // Listen for cacheHit events on globalEventBus
  useEffect(() => {
    if (!cacheEnabled) return;

    const handler = () => {
      pendingCacheHit.current = true;
    };

    const unsubscribe = globalEventBus.on('cacheHit' as never, handler as never);
    return unsubscribe;
  }, [cacheEnabled]);

  // Manage cache lifecycle: create/destroy when cacheEnabled or selectedModel changes
  useEffect(() => {
    let cancelled = false;

    if (cacheEnabled && baseModelRef.current) {
      setIsCacheLoading(true);

      createSemanticCacheInstance()
        .then((cache) => {
          if (cancelled) {
            cache.destroy().catch(() => {});
            return;
          }
          cacheRef.current = cache;
          modelRef.current = createCachedModel(baseModelRef.current!, cache);
          setCacheStats(toCacheStats(cache.stats()));
          setIsCacheLoading(false);
        })
        .catch((err) => {
          console.error('Failed to create semantic cache:', err);
          if (!cancelled) {
            setIsCacheLoading(false);
            modelRef.current = baseModelRef.current;
          }
        });
    } else {
      // Cache disabled — destroy existing cache and use base model
      if (cacheRef.current) {
        cacheRef.current.destroy().catch(() => {});
        cacheRef.current = null;
      }
      modelRef.current = baseModelRef.current;
      setCacheStats(null);
    }

    return () => {
      cancelled = true;
    };
  }, [cacheEnabled, selectedModel]);

  // Cleanup cache on unmount
  useEffect(() => {
    return () => {
      if (cacheRef.current) {
        cacheRef.current.destroy().catch(() => {});
        cacheRef.current = null;
      }
    };
  }, []);

  // Delegate to @localmode/react useChat
  const reactChat = useReactChat({
    model: modelRef.current!,
    systemPrompt,
    maxTokens: CHAT_CONFIG.maxTokens,
    temperature: CHAT_CONFIG.temperature,
    persist: true,
    persistKey: STORAGE_KEYS.chat + '-messages',
  });

  // Sync system prompt changes to the react hook
  useEffect(() => {
    reactChat.setSystemPrompt(systemPrompt);
  }, [systemPrompt]);

  // Derive streamingMessageId
  let streamingMessageId: string | null = null;
  if (reactChat.isStreaming && reactChat.messages.length > 0) {
    const lastMessage = reactChat.messages[reactChat.messages.length - 1];
    if (lastMessage.role === 'assistant') {
      streamingMessageId = lastMessage.id;
    }
  }

  /** Refresh cache stats from the cache instance */
  const refreshCacheStats = () => {
    if (cacheRef.current) {
      setCacheStats(toCacheStats(cacheRef.current.stats()));
    }
  };

  /** Send a message and stream the response */
  const sendMessage = async (text: string, images?: ChatImageAttachment[]) => {
    if (!selectedModel) return;

    // Reset pending cache hit flag and record start time
    pendingCacheHit.current = false;
    sendStartTime.current = performance.now();

    // Convert ChatImageAttachment to ImageAttachment for the react hook
    const imageAttachments = images?.map((img) => ({
      data: img.data,
      mimeType: img.mimeType,
      name: img.name,
    }));

    await reactChat.send(text, imageAttachments ? { images: imageAttachments } : undefined);

    // After send completes, check if it was a cache hit
    if (pendingCacheHit.current && cacheEnabled) {
      const durationMs = Math.round(performance.now() - sendStartTime.current);

      // Find the latest assistant message and mark it as cached
      const msgs = reactChat.messages;
      if (msgs.length > 0) {
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg.role === 'assistant') {
          cachedMessageMap.current.set(lastMsg.id, durationMs);
        }
      }
      pendingCacheHit.current = false;
    }

    refreshCacheStats();
  };

  /** Cancel the current streaming request */
  const cancelStreaming = () => {
    reactChat.cancel();
  };

  /** Clear all messages */
  const clearMessages = () => {
    reactChat.cancel();
    reactChat.clearMessages();
    cachedMessageMap.current.clear();
  };

  /** Export messages to a JSON file */
  const exportMessages = (msgs: ChatMessage[]) => {
    downloadBlob(
      JSON.stringify(msgs, null, 2),
      `chat-${new Date().toISOString()}.json`,
      'application/json',
    );
  };

  /** Clear all cache entries and refresh stats */
  const clearCache = async () => {
    if (cacheRef.current) {
      await cacheRef.current.clear();
      refreshCacheStats();
    }
  };

  // Annotate messages with cache metadata from the map
  const messages: ChatMessage[] = (reactChat.messages as ChatMessage[]).map((msg) => {
    const cachedDuration = cachedMessageMap.current.get(msg.id);
    if (cachedDuration !== undefined) {
      return { ...msg, cached: true, cacheDurationMs: cachedDuration };
    }
    return msg;
  });

  // Clear messages from both sides when toggling agent mode
  useEffect(() => {
    if (agentEnabled !== prevAgentEnabled.current) {
      prevAgentEnabled.current = agentEnabled;
      // Clear regular chat messages
      reactChat.cancel();
      reactChat.clearMessages();
      cachedMessageMap.current.clear();
      // Clear agent chat messages
      agentChat.clearMessages();
    }
  }, [agentEnabled]);

  // When agent mode is on, delegate to the agent chat hook
  if (agentEnabled) {
    return {
      messages: agentChat.messages,
      isStreaming: agentChat.isStreaming,
      streamingMessageId: agentChat.streamingMessageId,
      sendMessage: agentChat.sendMessage,
      cancelStreaming: agentChat.cancelStreaming,
      clearMessages: () => {
        agentChat.clearMessages();
        // Also clear regular chat so switching back starts fresh
        reactChat.cancel();
        reactChat.clearMessages();
        cachedMessageMap.current.clear();
      },
      exportMessages,
      cacheStats: null,
      isCacheLoading: false,
      clearCache,
    };
  }

  return {
    messages,
    isStreaming: reactChat.isStreaming,
    streamingMessageId,
    sendMessage,
    cancelStreaming,
    clearMessages,
    exportMessages,
    cacheStats,
    isCacheLoading,
    clearCache,
  };
}

/** Convert full CacheStats to the subset used in the UI */
function toCacheStats(stats: {
  entries: number;
  hits: number;
  misses: number;
  hitRate: number;
}): CacheStats {
  return {
    entries: stats.entries,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: stats.hitRate,
  };
}
