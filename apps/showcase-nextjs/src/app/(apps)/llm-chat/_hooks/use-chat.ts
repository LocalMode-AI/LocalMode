/**
 * @file use-chat.ts
 * @description Hook for managing chat interactions with abort support
 */
'use client';

import { useChatStore } from '../_store/chat.store';
import { streamChatResponse, ChatAbortError } from '../_services/chat.service';
import { createMessage, buildPrompt, exportMessagesAsJson } from '../_lib/utils';
import type { ChatMessage } from '../_lib/types';

/** Hook for chat message sending and management */
export function useChat() {
  const store = useChatStore();

  /**
   * Send a message and stream the response
   * Supports cancellation via AbortController
   * @param text - The message text to send
   */
  const sendMessage = async (text: string) => {
    const state = useChatStore.getState();

    // Create abort controller for this request
    const abortController = new AbortController();

    // Add user message
    const userMessage = createMessage('user', text);
    store.addMessage(userMessage);

    // Add empty assistant message for streaming
    const assistantMessage = createMessage('assistant', '');
    store.addMessage(assistantMessage);

    store.setStreaming(true, abortController);
    store.setStreamingMessageId(assistantMessage.id);

    try {
      // Build prompt from conversation
      const prompt = buildPrompt([...state.messages, userMessage], state.systemPrompt);

      // Stream response from service with abort signal
      for await (const chunk of streamChatResponse({
        modelId: state.selectedModel,
        prompt,
        signal: abortController.signal,
      })) {
        store.appendToMessage(assistantMessage.id, chunk);
      }
    } catch (error) {
      // Handle abort gracefully
      if (error instanceof ChatAbortError) {
        const partial =
          useChatStore.getState().messages.find((m) => m.id === assistantMessage.id)?.content ?? '';
        store.updateMessage(assistantMessage.id, partial || '[Cancelled]');
      } else {
        console.error('Chat error:', error);
        store.updateMessage(assistantMessage.id, 'Sorry, I encountered an error. Please try again.');
      }
    } finally {
      store.setStreaming(false);
      store.setStreamingMessageId(null);
    }
  };

  /**
   * Cancel the current streaming request
   */
  const cancelStreaming = () => {
    store.abortStreaming();
  };

  /**
   * Export messages to a JSON file
   * @param messages - Messages to export
   */
  const exportMessages = (messages: ChatMessage[]) => {
    exportMessagesAsJson(messages);
  };

  return {
    sendMessage,
    cancelStreaming,
    exportMessages,
  };
}
