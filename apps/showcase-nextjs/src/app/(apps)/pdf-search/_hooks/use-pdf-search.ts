/**
 * @file use-pdf-search.ts
 * @description Hook for searching documents and managing chat
 */
'use client';

import { usePDFStore } from '../_store/pdf.store';
import { useChatStore } from '../_store/chat.store';
import { useUIStore } from '../_store/ui.store';
import { searchDocuments } from '../_services/pdf.service';
import { createMessage, formatSearchResponse, buildSearchContext } from '../_lib/utils';

/** Hook for PDF search and chat */
export function usePDFSearch() {
  const pdfStore = usePDFStore();
  const chatStore = useChatStore();
  const uiStore = useUIStore();

  /**
   * Ask a question about the documents
   * @param question - Question to ask
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
      // Search documents
      const { results, searchTime } = await searchDocuments({
        query: question,
        topK: uiStore.topK,
        useReranking: uiStore.useReranking,
      });

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

  /**
   * Clear chat history
   */
  const clearChat = () => {
    chatStore.clearMessages();
  };

  return {
    askQuestion,
    clearChat,
    messages: chatStore.messages,
    isSearching: chatStore.isSearching,
    error: chatStore.error,
  };
}
