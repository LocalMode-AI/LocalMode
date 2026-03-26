/**
 * @file use-pdf-search.ts
 * @description Hook for searching documents and managing chat.
 *
 * Uses an inference queue to prioritize interactive search over background
 * document indexing. Search queries run at 'interactive' priority.
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import { createInferenceQueue, type InferenceQueue, type QueueStats } from '@localmode/core';
import { usePDFStore } from '../_store/pdf.store';
import { useChatStore } from '../_store/chat.store';
import { useUIStore } from '../_store/ui.store';
import { searchDocuments } from '../_services/pdf.service';
import { createMessage, formatSearchResponse, buildSearchContext } from '../_lib/utils';
import { QUEUE_CONFIG } from '../_lib/constants';

const EMPTY_STATS: QueueStats = { pending: 0, active: 0, completed: 0, failed: 0, avgLatencyMs: 0 };

/** Hook for PDF search and chat with inference queue */
export function usePDFSearch() {
  const pdfStore = usePDFStore();
  const chatStore = useChatStore();
  const uiStore = useUIStore();
  const [queueStats, setQueueStats] = useState<QueueStats>(EMPTY_STATS);
  const queueRef = useRef<InferenceQueue | null>(null);

  // Create inference queue on mount
  useEffect(() => {
    const queue = createInferenceQueue({
      concurrency: QUEUE_CONFIG.concurrency,
      priorities: QUEUE_CONFIG.priorities as string[],
    });
    queueRef.current = queue;

    const unsub = queue.on('stats', (stats) => {
      setQueueStats({ ...stats });
    });

    return () => {
      unsub();
      queue.destroy();
      queueRef.current = null;
    };
  }, []);

  /**
   * Ask a question about the documents.
   * Routes through the inference queue at 'interactive' priority.
   */
  const askQuestion = async (question: string) => {
    // Check if there are any documents
    if (pdfStore.documents.length === 0) {
      const errorMessage = createMessage(
        'system',
        'Please upload a PDF document first before asking questions.'
      );
      chatStore.addMessage(errorMessage);
      return;
    }

    // Add user message
    const userMessage = createMessage('user', question);
    chatStore.addMessage(userMessage);

    chatStore.setSearching(true);
    chatStore.clearError();

    try {
      // Route search through the inference queue at interactive priority
      const queue = queueRef.current;
      const searchFn = () => searchDocuments({
        query: question,
        topK: uiStore.topK,
        useReranking: uiStore.useReranking,
        minScore: uiStore.threshold.source === 'calibrated' ? uiStore.threshold.value : undefined,
      });

      const { results, searchTime } = queue
        ? await queue.add(searchFn, { priority: 'interactive' })
        : await searchFn();

      if (results.length === 0) {
        const noResultsMessage = createMessage(
          'assistant',
          "I couldn't find any relevant passages in the documents for your question. Try rephrasing or uploading more documents."
        );
        chatStore.addMessage(noResultsMessage);
      } else {
        // Build response with context
        const context = buildSearchContext(results);
        const response = formatSearchResponse(context, results.length, searchTime);

        const assistantMessage = createMessage('assistant', response);
        chatStore.addMessage(assistantMessage);
      }
    } catch (error) {
      console.error('Search error:', error);
      chatStore.setError({
        message: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        code: 'SEARCH_FAILED',
        recoverable: true,
      });

      const errorMessage = createMessage(
        'assistant',
        `Sorry, I encountered an error while searching: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      chatStore.addMessage(errorMessage);
    } finally {
      chatStore.setSearching(false);
    }
  };

  /** Clear chat history */
  const clearChat = () => {
    chatStore.clearMessages();
  };

  /** Get the queue instance (for background indexing from other hooks) */
  const getQueue = () => queueRef.current;

  return {
    askQuestion,
    clearChat,
    getQueue,
    messages: chatStore.messages,
    isSearching: chatStore.isSearching,
    error: chatStore.error,
    queueStats,
  };
}
